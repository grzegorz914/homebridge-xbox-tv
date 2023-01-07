"use strict";

const Crypto = require('crypto');
const EC = require('elliptic').ec;

class SGCRYPTO {
    constructor() {

        this.publicKey = Buffer.from('', 'hex');
        this.secret = Buffer.from('', 'hex');
        this.encryptionKey = false;
        this.iv = false;
        this.hashKey = false;

    };

    load(publicKey, secret) {
        if (!publicKey || !secret) {
            throw new Error('Both public key and secret are required for loading.');
        }

        this.publicKey = Buffer.from(publicKey);
        this.secret = Buffer.from(secret);

        const data = {
            'aes_key': Buffer.from(this.secret.slice(0, 16)),
            'aes_iv': Buffer.from(this.secret.slice(16, 32)),
            'hmac_key': Buffer.from(this.secret.slice(32))
        };

        this.iv = data.aes_iv;
        this.hashKey = data.hmac_key;
        this.encryptionKey = data.aes_key;
    };

    getSecret() {
        return this.secret;
    };

    getHmac() {
        if (!this.encryptionKey) {
            this.load();
        };
        return this.hashKey;
    };

    signPublicKey(publicKey) {
        const ec = new EC('p256');
        const sha512 = Crypto.createHash('sha512');

        // Generate keys
        const key1 = ec.genKeyPair();
        const key2 = ec.keyFromPublic(publicKey, 'hex');

        const shared1 = key1.derive(key2.getPublic());
        const derivedSecret = Buffer.from(shared1.toString(16), 'hex');
        const publicKeyClient = key1.getPublic('hex');

        const preSalt = Buffer.from('d637f1aae2f0418c', 'hex');
        const postSalt = Buffer.from('a8f81a574e228ab7', 'hex');
        const prePostSalt = Buffer.concat([preSalt, derivedSecret, postSalt]);

        // Hash shared secret
        const sha = sha512.update(prePostSalt);
        const secret = sha.digest();

        return {
            publicKey: publicKeyClient.toString('hex').slice(2),
            secret: secret.toString('hex'),
        };
    };

    getPublicKey() {
        return this.publicKey;
    };

    getEncryptionKey() {
        if (!this.encryptionKey) {
            this.load();
        };
        return this.encryptionKey;
    };

    getIv() {
        if (!this.iv) {
            this.load();
        };
        return this.iv;
    };

    getHashKey() {
        if (!this.hashKey) {
            this.load();
        };
        return this.hashKey;
    };

    encrypt(data, key = false, iv = false) {
        data = Buffer.from(data);

        if (!key) {
            key = this.getEncryptionKey();
        }

        if (!iv) {
            iv = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
        }

        const cipher = Crypto.createCipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let encryptedPayload = cipher.update(data, 'binary', 'binary');
        encryptedPayload += cipher.final('binary');
        return Buffer.from(encryptedPayload, 'binary');
    }

    decrypt(data, iv, key = false) {
        if (!key) {
            key = this.getEncryptionKey();
        }

        if (!iv) {
            iv = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
        }

        const paddedData = this.addPadding(data);
        const cipher = Crypto.createDecipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let decryptedPayload = cipher.update(paddedData, 'binary', 'binary');
        decryptedPayload += cipher.final('binary');
        return this.removePadding(Buffer.from(decryptedPayload, 'binary'));
    };

    sign(data) {
        const hashHmac = Crypto.createHmac('sha256', this.getHashKey());
        hashHmac.update(data, 'binary', 'binary');
        const protectedPayloadHash = hashHmac.digest('binary');
        const protectedPayloadHashBuffer = Buffer.from(protectedPayloadHash, 'binary');
        return protectedPayloadHashBuffer
    };

    removePadding(payload) {
        const payloadBuffer = Buffer.from(payload.slice(-1));
        const payloadLength = payloadBuffer.readUInt8(0);

        if (payloadLength > 0 && payloadLength < 16) {
            return Buffer.from(payload.slice(0, payload.length - payloadLength));
        }
        return payload;
    };

    addPadding(payload) {
        return payload;
    };
}
module.exports = SGCRYPTO;