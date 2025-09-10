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
        this.ec = new EC('p256'); // P-256
    }

    async getPublicKey(certificate) {
        try {
            certificate = certificate.toString('base64').match(/.{0,64}/g).join('\n');
            const pem = `-----BEGIN CERTIFICATE-----${EOL}${certificate}-----END CERTIFICATE-----`;

            const ecKey = JsRsaSign.X509.getPublicKeyFromCertPEM(pem);
            const sha512 = Crypto.createHash('sha512');

            const key1 = this.ec.genKeyPair();
            const key2 = this.ec.keyFromPublic(ecKey.pubKeyHex, 'hex');

            const shared1 = key1.derive(key2.getPublic());
            const derivedSecret = Buffer.from(shared1.toString(16), 'hex');
            const publicKeyClient = key1.getPublic('hex');

            const preSalt = Buffer.from('d637f1aae2f0418c', 'hex');
            const postSalt = Buffer.from('a8f81a574e228ab7', 'hex');
            const prePostSalt = Buffer.concat([preSalt, derivedSecret, postSalt]);

            const shaSecret = sha512.update(prePostSalt).digest();

            const publicKey = Buffer.from(publicKeyClient.substring(2), 'hex');
            const secret = Buffer.from(shaSecret.toString('hex'), 'hex');

            this.key = secret.subarray(0, 16);
            this.iv = secret.subarray(16, 32);
            this.hashKey = secret.subarray(32, 64);

            return { publicKey, iv: this.iv };
        } catch (error) {
            throw new Error(`sign public key error: ${error}`);
        }
    }

    getKey() {
        return this.key;
    }

    getIv() {
        return this.iv;
    }

    encrypt(data, key, iv) {
        data = Buffer.from(data);
        key = key || this.key;
        iv = iv || IV;

        const cipher = Crypto.createCipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let encryptedPayload = cipher.update(data, 'binary', 'binary');
        encryptedPayload += cipher.final('binary');
        return Buffer.from(encryptedPayload, 'binary');
    }

    decrypt(data, iv, key) {
        key = key || this.key;
        iv = iv || IV;

        const decipher = Crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(false);

        let decryptedPayload = decipher.update(data, 'binary', 'binary');
        decryptedPayload += decipher.final('binary');
        return this.removePadding(Buffer.from(decryptedPayload, 'binary'));
    }

    sign(data) {
        const hashHmac = Crypto.createHmac('sha256', this.hashKey);
        hashHmac.update(data, 'binary', 'binary');
        return Buffer.from(hashHmac.digest('binary'), 'binary');
    }

    removePadding(payload) {
        const payloadLength = payload.slice(-1).readUInt8(0);
        if (payloadLength > 0 && payloadLength < 16) {
            return payload.slice(0, payload.length - payloadLength);
        }
        return payload;
    }
}

export default SgCrypto;
