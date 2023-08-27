"use strict";
const JsRsaSign = require('jsrsasign');
const Crypto = require('crypto');
const EOL = require('os').EOL;
const EC = require('elliptic').ec;

class SGCRYPTO {
    constructor() {
        this.encryptionKey = false;
        this.iv = false;
        this.hashKey = false;

    };

    getPublicKey(decodedMessage) {
        return new Promise(async (resolve, reject) => {
            try {
                // Set certyficate
                const certyficate = (decodedMessage.certificate).toString('base64').match(/.{0,64}/g).join('\n');

                // Set pem
                const pem = `-----BEGIN CERTIFICATE-----${EOL}${certyficate}-----END CERTIFICATE-----`;

                // Create public key
                const ecKey = JsRsaSign.X509.getPublicKeyFromCertPEM(pem);

                const ec = new EC('p256');
                const sha512 = Crypto.createHash('sha512');

                // Generate keys
                const key1 = ec.genKeyPair();
                const key2 = ec.keyFromPublic(ecKey.pubKeyHex, 'hex');

                const shared1 = key1.derive(key2.getPublic());
                const derivedSecret = Buffer.from(shared1.toString(16), 'hex');
                const publicKeyClient = key1.getPublic('hex');

                const preSalt = Buffer.from('d637f1aae2f0418c', 'hex');
                const postSalt = Buffer.from('a8f81a574e228ab7', 'hex');
                const prePostSalt = Buffer.concat([preSalt, derivedSecret, postSalt]);

                // Hash shared secret
                const sha = sha512.update(prePostSalt);
                const shaSecret = sha.digest();

                const publicKeyHex = publicKeyClient.toString('hex');
                const publicKey = Buffer.from(publicKeyHex.substring(2), 'hex');
                const shaSecretHex = shaSecret.toString('hex');
                const secret = Buffer.from(shaSecretHex, 'hex');

                this.encryptionKey = secret.subarray(0, 16);
                this.iv = secret.subarray(16, 32);
                this.hashKey = secret.subarray(32);

                const data = {
                    publicKey: publicKey,
                    iv: this.iv
                };

                resolve(data);
            } catch (error) {
                reject(`sign public key error: ${error}`);
            };
        });
    };

    getEncryptionKey() {
        return this.encryptionKey;
    };

    getIv() {
        return this.iv;
    };

    getHashKey() {
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
        return Buffer.from(protectedPayloadHash, 'binary');
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