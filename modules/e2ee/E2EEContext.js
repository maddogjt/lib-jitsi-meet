/* global __filename, TransformStream */

import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);

// We use a ringbuffer of keys so we can change them and still decode packets that were
// encrypted with an old key.
const keyRingSize = 8;

// We use a 96 bit IV for AES GCM. This is signalled in plain together with the
// packet. See https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
const ivLength = 12;

// We copy the first bytes of the VP8 payload unencrypted.
// For keyframes this is 10 bytes, for non-keyframes (delta) 3. See
//   https://tools.ietf.org/html/rfc6386#section-9.1
// This allows the bridge to continue detecting keyframes (only one byte needed in the JVB)
// and is also a bit easier for the VP8 decoder (i.e. it generates funny garbage pictures
// instead of being unable to decode).
// This is a bit for show and we might want to reduce to 1 unconditionally in the final version.
const unencryptedBytes = {
    key: 10,
    delta: 3
};


/**
 * Context encapsulating the crypt required for E2EE.
 */
export default class E2EEcontext {

    /**
     * Build a new E2EE context instance, which will be used in a given conference.
     *
     * @param {string} options.salt - Salt to be used for key deviation.
     */
    constructor(options) {
        this._options = options;

        // An array (ring) of keys that we use for sending and receiving.
        this._cryptoKeyRing = new Array(keyRingSize);

        // A pointer to the currently used key.
        this._currentKeyIndex = -1;

        // We keep track of how many frames we have sent per ssrc.
        // Starts with a random offset similar to the RTP sequence number.
        this._sendCounts = new Map();
    }

    /**
     * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will injecct
     * a frame decoder.
     *
     * @param {RTCRtpReceiver} receiver - The receiver which will get the decoding function injected.
     * @param {string} kind - The kind of track this receiver belongs to.
     */
    handleReveiver(receiver, kind) {
        const receiverStreams
            = kind === 'video' ? receiver.createEncodedVideoStreams() : receiver.createEncodedAudioStreams();
        const transform = new TransformStream({
            transform: this._decodeFunction.bind(this)
        });

        receiverStreams.readableStream
            .pipeThrough(transform)
            .pipeTo(receiverStreams.writableStream);
    }

    /**
     * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will injecct
     * a frame encoder.
     *
     * @param {RTCRtpSender} sender - The sender which will get the encoding funcction injected.
     * @param {string} kind - The kind of track this sender belongs to.
     */
    handleSender(sender, kind) {
        const senderStreams
            = kind === 'video' ? sender.createEncodedVideoStreams() : sender.createEncodedAudioStreams();
        const transform = new TransformStream({
            transform: this._encodeFunction.bind(this)
        });

        senderStreams.readableStream
            .pipeThrough(transform)
            .pipeTo(senderStreams.writableStream);
    }

    /**
     * Sets the key to be used for E2EE.
     *
     * @param {string} value - Value to be used as the new key.
     */
    async setKey(value) {
        const key = await this._deriveKey(value);

        // TODO.
    }

    /**
     * Function that will be injected in a stream and will encrypt the given chunks.
     *
     * @param {RTCEncodedVideoFrame} chunk - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     */
    _encodeFunction(chunk, controller) {
        const keyIndex = this._currentKeyIndex % this._cryptoKeyRing.length;

        if (this._cryptoKeyRing[keyIndex]) {
            // construct IV akin https://tools.ietf.org/html/rfc7714#section-8.1
            const iv = new ArrayBuffer(ivLength);
            const ivView = new DataView(iv);

            ivView.setUint32(0, chunk.synchronizationSource);
            ivView.setUint32(4, chunk.timestamp);

            // having to keep our own send count (similar to a picture id) is not ideal.
            if (!this._sendCounts.has(chunk.synchronizationSource)) {
                // Initialize with a random offset, similar to the RTP sequence number.
                this._sendCounts.set(chunk.synchronizationSource, Math.floor(Math.random() * 0xFFFF));
            }
            const sendCount = this._sendCounts.get(chunk.synchronizationSource);

            ivView.setUint32(8, sendCount % 0xFFFF);
            this._sendCounts.set(chunk.synchronizationSource, sendCount + 1);

            return crypto.subtle.encrypt({
                name: 'AES-GCM',
                iv
            }, this._cryptoKeyRing[keyIndex], new Uint8Array(chunk.data, unencryptedBytes[chunk.type]))
            .then(cipherText => {
                const newData = new ArrayBuffer(unencryptedBytes[chunk.type] + cipherText.byteLength
                    + iv.byteLength + 1);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(new Uint8Array(chunk.data, 0, unencryptedBytes[chunk.type])); // copy first bytes.
                newUint8.set(new Uint8Array(cipherText), unencryptedBytes[chunk.type]); // add ciphertext.
                newUint8.set(new Uint8Array(iv), unencryptedBytes[chunk.type] + cipherText.byteLength); // append IV.
                newUint8[unencryptedBytes + cipherText.byteLength + ivLength] = keyIndex; // set key index.

                chunk.data = newData;

                return controller.enqueue(chunk);
            }, e => {
                logger.error(e);
            });
        }

        // TODO: define behaviour. Do not send unencrypted.
        logger.error('Could not encrypt frame as there is no key.');
    }

    /**
     * Function that will be injected in a stream and will decrypt the given chunks.
     *
     * @param {RTCEncodedVideoFrame} chunk - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     */
    _decodeFunction(chunk, controller) {
        const data = new Uint8Array(chunk.data);
        const keyIndex = data[chunk.data.byteLength - 1];

        if (this._cryptoKeyRing[keyIndex]) {
            // TODO: use chunk.type again, see https://bugs.chromium.org/p/chromium/issues/detail?id=1068468
            // (fixed in latest M83)
            const chunkType = (data[0] & 0x1) === 0 ? 'key' : 'delta'; // eslint-disable-line no-bitwise
            const iv = new Uint8Array(chunk.data, chunk.data.byteLength - ivLength - 1, ivLength);
            const cipherTextStart = unencryptedBytes[chunkType];
            const cipherTextLength = chunk.data.byteLength - (unencryptedBytes[chunkType] + ivLength + 1);

            return crypto.subtle.decrypt({
                name: 'AES-GCM',
                iv
            }, this._cryptoKeyRing[keyIndex], new Uint8Array(chunk.data, cipherTextStart, cipherTextLength))
            .then(plainText => {
                const newData = new ArrayBuffer(10 + plainText.byteLength);
                const newUint8 = new Uint8Array(newData);

                newUint8.set(new Uint8Array(chunk.data, 0, unencryptedBytes[chunkType]));
                newUint8.set(new Uint8Array(plainText), unencryptedBytes[chunkType]);

                chunk.data = newData;

                return controller.enqueue(chunk);
            }, e => {
                logger.error(e);
            });
        }

        // TODO: this just passes through to the decoder. Is that ok? If we don't know the key yet
        // we might want to buffer a bit but it is still unclear how to do that (and for how long etc).
        controller.enqueue(chunk);
    }
}
