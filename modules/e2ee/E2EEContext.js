/* global __filename, TransformStream */

import { getLogger } from 'jitsi-meet-logger';

const logger = getLogger(__filename);


/**
 * Context encapsulating the crypt required for E2EE.s
 */
export default class E2EEcontext {

    /**
     * Build a new E2EE context instance, which will be used in a given conference.
     *
     * @param {string} options.salt - Salt to be used for key deviation.
     */
    consructor(options) {
        this._options = options;
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
            transform: this._decodeFunction
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
            transform: this._encodeFunction
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

    /**
     * Derives a key from the passed value.
     *
     * @param {string} value - Value to derive the key from.
     */
    async _deriveKey(value) {
        // TODO.

        return value;
    }
}
