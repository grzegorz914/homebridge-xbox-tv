"use strict";
const SimplePacket = require('./simple');
const MessagePacket = require('./message');
const CONSTANS = require('../constans.json');

class PACKER {
    constructor(type) {
        const packetType = type.slice(0, 2).toString('hex');
        this.packetStructure = '';

        if (packetType in CONSTANS.Types) {
            const packetValue = type;
            type = CONSTANS.Types[packetType];
            this.packetStructure = this.loadPacketStructure(type, packetValue);
        } else {
            this.packetStructure = this.loadPacketStructure(type);
        };
        this.structure = this.packetStructure;
    };

    loadPacketStructure(type, value = false) {
        if (type.slice(0, 6) == 'simple') {
            return new SimplePacket(type.slice(7), value);
        } else if (type.slice(0, 7) == 'message') {
            return new MessagePacket(type.slice(8), value);
        } else {
            return false;
        };
    };

    set(key, value, protectedPayload = false) {
        this.structure.set(key, value, protectedPayload);
    };

    setChannel(channelId) {
        this.structure.setChannel(channelId);
    };

    pack(xboxlocalapi = undefined) {
        return this.packetStructure.pack(xboxlocalapi);
    };

    unpack(xboxlocalapi = undefined) {
        return this.packetStructure.unpack(xboxlocalapi);
    };
};
module.exports = PACKER;