const Packer = require('./packet/packer');
const SGCrypto = require('./sgcrypto.js');
const uuidParse = require('uuid-parse');
const uuid = require('uuid');
const os = require('os');
const EOL = os.EOL;
const jsrsasign = require('jsrsasign');
const EventEmitter = require('events');

class XBOX extends EventEmitter {
    constructor(config) {
        super();
        this.ip = config.ip;
        this.liveId = config.liveId;

        this.crypto = new SGCrypto();

        this.iv = false;
        this.isAuthenticated = false;
        this.requestNum = 1;
        this.participantId = false;
        this.targetParticipantId = 0;
        this.sourceParticipantId = 0;
        this.fragments = {};
    };

    setLiveid(liveId) {
        this.liveId = liveId;
    };

    getRequestNum() {
        let num = this.requestNum;
        this.requestNum++;

        this.emit('debug', `Request number set to: ${this.requestNum}`)
        return num;
    };

    setParticipantId(participantId) {
        this.participantId = participantId;
        this.sourceParticipantId = participantId;
    };

    connect(uhs, xstsToken, certyficate) {
        // // Set liveId
        const pem = `-----BEGIN CERTIFICATE-----${EOL}${certyficate}-----END CERTIFICATE-----`;
        const deviceCert = new jsrsasign.X509();
        deviceCert.readCertPEM(pem);

        // var hSerial    = deviceCert.getSerialNumberHex(); // '009e755e" hexadecimal string
        // var sIssuer    = deviceCert.getIssuerString();    // '/C=US/O=z2'
        // var sSubject   = deviceCert.getSubjectString();   // '/C=US/O=z2'
        // var sNotBefore = deviceCert.getNotBefore();       // '100513235959Z'
        // var sNotAfter  = deviceCert.getNotAfter();        // '200513235959Z'

        this.setLiveid(deviceCert.getSubjectString().slice(4));

        // Set uuid
        const uuid4 = Buffer.from(uuidParse.parse(uuid.v4()));

        // Create public key
        const ecKey = jsrsasign.X509.getPublicKeyFromCertPEM(pem);
        this.emit('debug', `Signing public key: ${ecKey.pubKeyHex}`);

        const object = this.crypto.signPublicKey(ecKey.pubKeyHex);
        this.emit('message', `Crypto output: ${object}`);

        // Load crypto data
        this.loadCrypto(object.publicKey, object.secret);

        this.emit('message', 'Sending connectRequest to xbox');
        const config = {
            type: 'simple.connectRequest'
        };
        let connectRequest = new Packer(config);
        connectRequest.set('uuid', uuid4);
        connectRequest.set('publicKey', this.crypto.getPublicKey());
        connectRequest.set('iv', this.crypto.getIv());

        if (uhs != undefined && xstsToken != undefined) {
            this.emit('debug', `Connecting using token: ${uhs}:${xstsToken}`);
            connectRequest.set('userhash', uhs, true);
            connectRequest.set('jwt', xstsToken, true);
            this.isAuthenticated = true;
        } else {
            this.emit('debug', 'Connecting using anonymous login');
            this.isAuthenticated = false;
        }

        const message = connectRequest.pack(this);
        return message;
    };

    loadCrypto(publicKey, sharedSecret) {
        this.emit('debug', `Loading crypto, public key: ${publicKey}, shared secret: ${sharedSecret}`);
        this.crypto.load(Buffer.from(publicKey, 'hex'), Buffer.from(sharedSecret, 'hex'));
    };
};
module.exports = XBOX;