"use strict";
const HexToBin = require('hex-to-binary');
const Packets = require('./packets.js');
const Structure = require('./structure');
const CONSTANTS = require('../constans.json');

class MESSAGE {
    constructor(type) {
        //type
        this.type = type;

        //packet
        this.packets = new Packets();
        this.packet = this.packets[type];

        //channelId
        this.channelId = '\x00\x00\x00\x00\x00\x00\x00\x00';
    };

    getMsgType(type) {
        const messageTypes = {
            0x1: "acknowledge",
            0x2: "group",
            0x3: "localJoin",
            0x5: "stopActivity",
            0x19: "auxilaryStream",
            0x1A: "activeSurfaceChange",
            0x1B: "navigate",
            0x1C: "json",
            0x1D: "tunnel",
            0x1E: "consoleStatus",
            0x1F: "titleTextConfiguration",
            0x20: "titleTextInput",
            0x21: "titleTextSelection",
            0x22: "mirroringRequest",
            0x23: "titleLaunch",
            0x26: "channelStartRequest",
            0x27: "channelStartResponse",
            0x28: "channelStop",
            0x29: "system",
            0x2A: "disconnect",
            0x2E: "titleTouch",
            0x2F: "accelerometer",
            0x30: "gyrometer",
            0x31: "inclinometer",
            0x32: "compass",
            0x33: "orientation",
            0x36: "pairedIdentityStateChanged",
            0x37: "unsnap",
            0x38: "recordGameDvr",
            0x39: "powerOff",
            0xF00: "mediaControllerRemoved",
            0xF01: "mediaCommand",
            0xF02: "mediaCommandResult",
            0xF03: "mediaState",
            0xF0A: "gamepad",
            0xF2B: "systemTextConfiguration",
            0xF2C: "systemTextInput",
            0xF2E: "systemTouch",
            0xF34: "systemTextAck",
            0xF35: "systemTextDone"
        }
        return messageTypes[type];
    };

    readFlags(flags) {
        const binaryFlag = HexToBin(flags.toString('hex'));
        const version = parseInt(binaryFlag.slice(0, 2), 2);
        const needAck = binaryFlag.slice(2, 3) === '1';
        const isFragment = binaryFlag.slice(3, 4) === '1';
        const type = this.getMsgType(parseInt(binaryFlag.slice(4, 16), 2));

        const packet = {
            version,
            needAck,
            isFragment,
            type
        };
        return packet;
    };

    setFlag(type) {
        const messageFlags = {
            acknowledge: Buffer.from('8001', 'hex'),
            0x2: "group",
            localJoin: Buffer.from('2003', 'hex'),
            0x5: "stopActivity",
            0x19: "auxilaryStream",
            0x1A: "activeSurfaceChange",
            0x1B: "navigate",
            json: Buffer.from('a01c', 'hex'),
            0x1D: "tunnel",
            consoleStatus: Buffer.from('a01e', 'hex'),
            0x1F: "titleTextConfiguration",
            0x20: "titleTextInput",
            0x21: "titleTextSelection",
            0x22: "mirroringRequest",
            0x23: "titleLaunch",
            channelStartRequest: Buffer.from('a026', 'hex'),
            channelStartResponse: Buffer.from('a027', 'hex'),
            channelStop: Buffer.from('a028', 'hex'),
            0x29: "system",
            disconnect: Buffer.from('802a', 'hex'),
            0x2E: "titleTouch",
            0x2F: "accelerometer",
            0x30: "gyrometer",
            0x31: "inclinometer",
            0x32: "compass",
            0x33: "orientation",
            0x36: "pairedIdentityStateChanged",
            0x37: "unsnap",
            recordGameDvr: Buffer.from('a038', 'hex'),
            powerOff: Buffer.from('a039', 'hex'),
            0xF00: "mediaControllerRemoved",
            mediaCommand: Buffer.from('af01', 'hex'),
            mediaCommandResult: Buffer.from('af02', 'hex'),
            mediaState: Buffer.from('af03', 'hex'),
            gamepad: Buffer.from('8f0a', 'hex'),
            0xF2B: "systemTextConfiguration",
            0xF2C: "systemTextInput",
            0xF2E: "systemTouch",
            0xF34: "systemTextAck",
            0xF35: "systemTextDone"
        };
        return messageFlags[type];
    };

    set(key, value, subkey = false) {
        switch (subkey) {
            case false:
                this.packet[key].value = value;
                break;
            default:
                this.packet[subkey][key].value = value;
                break;
        };
    };


    pack(crypto, sequenceNumber, sourceParticipantId, channelId = false) {
        const structure = new Structure();
        let packet;

        for (const name in this.packet) {
            this.packet[name].pack(structure);
        }

        const header = new Structure();
        header.writeBytes(Buffer.from('d00d', 'hex'));
        header.writeUInt16(structure.toBuffer().length);
        header.writeUInt32(sequenceNumber);
        header.writeUInt32(CONSTANTS.LocalApi.ParticipantId.Target);
        header.writeUInt32(sourceParticipantId);
        header.writeBytes(this.setFlag(this.type));
        const addChannelId = channelId ? header.writeBytes(Buffer.from(channelId)) : header.writeBytes(Buffer.from(this.channelId));

        if (structure.toBuffer().length % 16 > 0) {
            const padStart = structure.toBuffer().length % 16;
            const padTotal = 16 - padStart;
            for (let paddingNum = padStart + 1; paddingNum <= 16; paddingNum++) {
                structure.writeUInt8(padTotal);
            }
        }

        const payloadEncrypted = crypto.encrypt(structure.toBuffer(), crypto.getKey(), crypto.encrypt(header.toBuffer().slice(0, 16), crypto.getIv()));
        packet = Buffer.concat([
            header.toBuffer(),
            payloadEncrypted
        ]);

        const payloadProtected = crypto.sign(packet);
        packet = Buffer.concat([
            packet,
            Buffer.from(payloadProtected)
        ]);

        return packet;
    };

    unpack(crypto = undefined, data = false) {
        const structure = new Structure(data);
        const type = structure.readBytes(2).toString('hex');

        let packet = {
            type: type,
            payloadLength: structure.readUInt16(),
            sequenceNumber: structure.readUInt32(),
            targetParticipantId: structure.readUInt32(),
            sourceParticipantId: structure.readUInt32(),
            flags: this.readFlags(structure.readBytes(2)),
            channelId: structure.readBytes(8),
            payloadProtected: structure.readBytes()
        };
        packet.type = packet.flags.type;
        this.channelId = packet.channelId;

        // Lets decrypt the data when the payload is encrypted
        const payloadProtectedExist = packet.payloadProtected !== undefined;
        if (payloadProtectedExist) {
            packet.payloadProtected = Buffer.from(packet.payloadProtected.slice(0, -32));
            packet.signature = packet.payloadProtected.slice(-32);

            const payloadDecrypted = crypto.decrypt(packet.payloadProtected, crypto.encrypt(data.slice(0, 16), crypto.getIv()));
            packet.payloadProtected = {};

            const packetProtected = this.packets[packet.type];
            const structurePayloadDecrypted = new Structure(payloadDecrypted);
            for (const name in packetProtected) {
                packet.payloadProtected[name] = packetProtected[name].unpack(structurePayloadDecrypted);
            };
        };

        return packet;
    };
};
module.exports = MESSAGE;
