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
     * @param {TODO} chunk - Piece of data to be encoded.
     * @param {TODO} controller - Handler for encoded chunks.
     */
    _encodeFunction(chunk, controller) {
        // TODO.
    }

    /**
     * Function that will be injected in a stream and will decrypt the given chunks.
     *
     * @param {TODO} chunk - Piece of data to be decoded.
     * @param {TODO} controller - Handler for decoded chunks.
     */
    _decodeFunction(chunk, controller) {
        // TODO.
    }
}
