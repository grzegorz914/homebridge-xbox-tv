const crypto = require('crypto');
const EC = require('elliptic').ec;

class SGCRYPTO {
    constructor() {

        this.ec = new EC('p256');
        this.publicKey = Buffer.from('', 'hex');
        this.secret = Buffer.from('', 'hex');
        this.encryptionKey = false;
        this.iv = false;
        this.hashKey = false;

    };

    load(publicKey, secret) {
        if (publicKey != undefined && secret != undefined) {
            this.publicKey = Buffer.from(publicKey);
            this.secret = Buffer.from(secret);
        };

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
        const sha512 = crypto.createHash("sha512");

        // Generate keys
        const key1 = this.ec.genKeyPair();
        const key2 = this.ec.keyFromPublic(publicKey, 'hex');

        const shared1 = key1.derive(key2.getPublic());
        const derivedSecret = Buffer.from(shared1.toString(16), 'hex');
        const publicKeyClient = key1.getPublic('hex');

        const preSalt = Buffer.from('d637f1aae2f0418c', 'hex');
        const postSalt = Buffer.from('a8f81a574e228ab7', 'hex');
        const prePostSalt = Buffer.from(preSalt.toString('hex') + derivedSecret.toString('hex') + postSalt.toString('hex'), 'hex');

        // Hash shared secret
        const sha = sha512.update(prePostSalt);
        const secret = sha.digest();

        const packet = {
            publicKey: publicKeyClient.toString('hex').slice(2),
            secret: secret.toString('hex')
        };
        return packet;
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

        if (!iv) {
            iv = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
        };

        if (!key) {
            key = this.getEncryptionKey();
        };

        let cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let encryptedPayload = cipher.update(data, 'binary', 'binary');
        encryptedPayload += cipher.final('binary');
        const buffer = Buffer.from(encryptedPayload, 'binary');
        return buffer
    }

    decrypt(data, iv, key = false) {
        data = this.addPadding(data);

        if (!key) {
            key = this.getEncryptionKey();
        };

        if (!iv) {
            iv = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00');
        };

        let cipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        cipher.setAutoPadding(false);

        let decryptedPayload = cipher.update(data, 'binary', 'binary');
        decryptedPayload += cipher.final('binary');
        const removePadding = this.removePadding(Buffer.from(decryptedPayload, 'binary'));
        return removePadding;
    };

    sign(data) {
        let hashHmac = crypto.createHmac('sha256', this.getHashKey());
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
        } else {
            return payload;
        };
    };

    addPadding(payload) {
        return payload;
    };
}
module.exports = SGCRYPTO;