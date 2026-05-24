import Crypto from 'crypto';
import { EOL } from 'os';

const IV = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');

class SgCrypto {
    constructor() {
        this.key = false;
        this.iv = false;
        this.hashKey = false;
    }

    async getPublicKey(certificate) {
        try {
            certificate = certificate.toString('base64').match(/.{0,64}/g).join('\n');
            const pem = `-----BEGIN CERTIFICATE-----${EOL}${certificate}-----END CERTIFICATE-----`;

            // Extract the console's P-256 public key from the certificate (SPKI DER,
            // last 65 bytes = uncompressed point: 04 || x || y).
            const x509 = new Crypto.X509Certificate(pem);
            const spki = x509.publicKey.export({ type: 'spki', format: 'der' });
            const consolePublicKey = spki.slice(-65);

            // Generate an ephemeral P-256 key pair and compute the ECDH shared secret.
            const ecdh = Crypto.createECDH('prime256v1');
            ecdh.generateKeys();
            const sharedSecret = ecdh.computeSecret(consolePublicKey);

            // Strip the 04 uncompressed-point prefix → 64-byte (x || y) public key.
            const publicKey = ecdh.getPublicKey().slice(1);

            const preSalt = Buffer.from('d637f1aae2f0418c', 'hex');
            const postSalt = Buffer.from('a8f81a574e228ab7', 'hex');
            const shaSecret = Crypto.createHash('sha512')
                .update(Buffer.concat([preSalt, sharedSecret, postSalt]))
                .digest();

            this.key = shaSecret.subarray(0, 16);
            this.iv = shaSecret.subarray(16, 32);
            this.hashKey = shaSecret.subarray(32, 64);

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

    // Note: argument order (data, iv, key) differs from encrypt(data, key, iv) — kept as original.
    // All call sites pass (data, iv) relying on key defaulting to this.key.
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
        const payloadLength = payload.subarray(-1).readUInt8(0);
        if (payloadLength > 0 && payloadLength < 16) {
            return payload.subarray(0, payload.length - payloadLength);
        }
        return payload;
    }
}

export default SgCrypto;
