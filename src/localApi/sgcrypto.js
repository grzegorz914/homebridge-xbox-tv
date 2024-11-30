"use strict";
import JsRsaSign from 'jsrsasign';
import Crypto from 'crypto';
import { EOL } from 'os';
import Elliptic from 'elliptic';
const EC = Elliptic.ec;
const IV = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');

class SgCrypto {
    constructor() {
        this.key = false;
        this.iv = false;
        this.hashKey = false;

    };

    async getPublicKey(certificate) {
        try {
            // Set certyficate
            certificate = certificate.toString('base64').match(/.{0,64}/g).join('\n');

            // Set pem
            const pem = `-----BEGIN CERTIFICATE-----${EOL}${certificate}-----END CERTIFICATE-----`;

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

            this.key = secret.subarray(0, 16);
            this.iv = secret.subarray(16, 32);
            this.hashKey = secret.subarray(32, 64);

            const data = {
                publicKey: publicKey,
                iv: this.iv
            };

            return data;
        } catch (error) {
           throw new Error(`sign public key error: ${error}`);
        };
    };

    getKey() {
        return this.key;
    };

    getIv() {
        return this.iv;
    };

    encrypt(data, key, iv) {
        data = Buffer.from(data);
        key = !key ? this.key : key;
        iv = !iv ? IV : iv;

        const cipher = Crypto.createCipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let encryptedPayload = cipher.update(data, 'binary', 'binary');
        encryptedPayload += cipher.final('binary');
        encryptedPayload = Buffer.from(encryptedPayload, 'binary');
        return encryptedPayload;
    }

    decrypt(data, iv, key) {
        key = !key ? this.key : key;
        iv = !iv ? IV : iv;

        const cipher = Crypto.createDecipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let decryptedPayload = cipher.update(data, 'binary', 'binary');
        decryptedPayload += cipher.final('binary');
        decryptedPayload = this.removePadding(Buffer.from(decryptedPayload, 'binary'));
        return decryptedPayload;
    };

    sign(data) {
        const hashHmac = Crypto.createHmac('sha256', this.hashKey);
        hashHmac.update(data, 'binary', 'binary');
        let protectedPayloadHash = hashHmac.digest('binary');
        protectedPayloadHash = Buffer.from(protectedPayloadHash, 'binary');
        return protectedPayloadHash;
    };

    removePadding(payload) {
        const payloadBuffer = Buffer.from(payload.slice(-1));
        const payloadLength = payloadBuffer.readUInt8(0);

        payload = payloadLength > 0 && payloadLength < 16 ? Buffer.from(payload.slice(0, payload.length - payloadLength)) : payload;
        return payload;
    };
}
export default SgCrypto;
