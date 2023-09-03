"use strict";
const HexToBin = require('hex-to-binary');
const PacketStructure = require('./structure');
const Packets = require('./packets.js');
const CHANNELID = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00');

class MESSAGE {
    constructor(type, packetData = false) {

        switch (type.slice(0, 6)) {
            case 'simple':
                type = type.slice(7);
                break;
            case 'messag':
                type = type.slice(8);
                break;
        };

        //structure
        const structure = new Packets();
        this.structure = structure[type];

        //packet
        this.packet = new Packets(this.structure);
        this.packetType = type;
        this.packetData = packetData;
    };

    getMsgType(type) {
        const messageTypes = {
            0x1: "acknowledge",
            0x2: "Group",
            0x3: "localJoin",
            0x5: "StopActivity",
            0x19: "AuxilaryStream",
            0x1A: "ActiveSurfaceChange",
            0x1B: "Navigate",
            0x1C: "json",
            0x1D: "Tunnel",
            0x1E: "status",
            0x1F: "TitleTextConfiguration",
            0x20: "TitleTextInput",
            0x21: "TitleTextSelection",
            0x22: "MirroringRequest",
            0x23: "TitleLaunch",
            0x26: "channelRequest",
            0x27: "channelResponse",
            0x28: "StopChannel",
            0x29: "System",
            0x2A: "disconnect",
            0x2E: "TitleTouch",
            0x2F: "Accelerometer",
            0x30: "Gyrometer",
            0x31: "Inclinometer",
            0x32: "Compass",
            0x33: "Orientation",
            0x36: "PairedIdentityStateChanged",
            0x37: "Unsnap",
            0x38: "recordGameDvr",
            0x39: "powerOff",
            0xF00: "MediaControllerRemoved",
            0xF01: "mediaCommand",
            0xF02: "mediaCommandResult",
            0xF03: "mediaState",
            0xF0A: "gamepad",
            0xF2B: "SystemTextConfiguration",
            0xF2C: "SystemTextInput",
            0xF2E: "SystemTouch",
            0xF34: "SystemTextAck",
            0xF35: "SystemTextDone"
        }
        return messageTypes[type];
    };

    readFlags(flags) {
        flags = HexToBin(flags.toString('hex'));
        const needAck = flags.slice(2, 3) === '1';
        const isFragment = flags.slice(3, 4) === '1';
        const type = this.getMsgType(parseInt(flags.slice(4, 16), 2));

        const packet = {
            version: parseInt(flags.slice(0, 2), 2).toString(),
            needAck,
            isFragment,
            type
        };
        return packet;
    };

    setFlags(type) {
        const messageFlags = {
            acknowledge: Buffer.from('8001', 'hex'),
            0x2: "Group",
            localJoin: Buffer.from('2003', 'hex'),
            0x5: "StopActivity",
            0x19: "AuxilaryStream",
            0x1A: "ActiveSurfaceChange",
            0x1B: "Navigate",
            json: Buffer.from('a01c', 'hex'),
            0x1D: "Tunnel",
            status: Buffer.from('a01e', 'hex'),
            0x1F: "TitleTextConfiguration",
            0x20: "TitleTextInput",
            0x21: "TitleTextSelection",
            0x22: "MirroringRequest",
            0x23: "TitleLaunch",
            channelRequest: Buffer.from('a026', 'hex'),
            channelResponse: Buffer.from('a027', 'hex'),
            0x28: "StopChannel",
            0x29: "System",
            disconnect: Buffer.from('802a', 'hex'),
            0x2E: "TitleTouch",
            0x2F: "Accelerometer",
            0x30: "Gyrometer",
            0x31: "Inclinometer",
            0x32: "Compass",
            0x33: "Orientation",
            0x36: "PairedIdentityStateChanged",
            0x37: "Unsnap",
            recordGameDvr: Buffer.from('a038', 'hex'),
            powerOff: Buffer.from('a039', 'hex'),
            0xF00: "MediaControllerRemoved",
            mediaCommand: Buffer.from('af01', 'hex'),
            mediaCommandResult: Buffer.from('af02', 'hex'),
            mediaState: Buffer.from('af03', 'hex'),
            gamepad: Buffer.from('8f0a', 'hex'),
            0xF2B: "SystemTextConfiguration",
            0xF2C: "SystemTextInput",
            0xF2E: "SystemTouch",
            0xF34: "SystemTextAck",
            0xF35: "SystemTextDone"
        };
        return messageFlags[type];
    };

    set(key, value, subkey = false) {
        switch (subkey) {
            case true:
                this.structure[subkey][key].value = value;
                break;
            case false:
                this.structure[key].value = value;
                break;
        };
    }

    pack(crypto, requestNum, targetParticipantId) {
        const packetStructure = new PacketStructure();
        let packet;

        for (const name in this.structure) {
            this.structure[name].pack(packetStructure);
        }

        const header = new PacketStructure();
        header.writeBytes(Buffer.from('d00d', 'hex'));
        header.writeUInt16(packetStructure.toBuffer().length);
        header.writeUInt32(requestNum);
        header.writeUInt32(targetParticipantId);
        header.writeUInt32(targetParticipantId);
        header.writeBytes(this.setFlags(this.packetType));
        header.writeBytes(CHANNELID);

        if (packetStructure.toBuffer().length % 16 > 0) {
            const padStart = packetStructure.toBuffer().length % 16;
            const padTotal = 16 - padStart;
            for (let paddingNum = padStart + 1; paddingNum <= 16; paddingNum++) {
                packetStructure.writeUInt8(padTotal);
            }
        }

        const encryptedPayload = crypto.encrypt(packetStructure.toBuffer(), crypto.getKey(), crypto.encrypt(header.toBuffer().slice(0, 16), crypto.getIv()));
        packet = Buffer.concat([
            header.toBuffer(),
            encryptedPayload
        ]);

        const protectedPayloadHash = crypto.sign(packet);
        packet = Buffer.concat([
            packet,
            Buffer.from(protectedPayloadHash)
        ]);

        return packet;
    };

    unpack(crypto = undefined) {
        const packetStructure = new PacketStructure(this.packetData);

        let packet = {
            type: packetStructure.readBytes(2).toString('hex'),
            payloadLength: packetStructure.readUInt16(),
            sequenceNumber: packetStructure.readUInt32(),
            targetParticipantId: packetStructure.readUInt32(),
            sourceParticipantId: packetStructure.readUInt32(),
            flags: this.readFlags(packetStructure.readBytes(2)),
            channelId: packetStructure.readBytes(8),
            protectedPayload: packetStructure.readBytes()
        };
        packet.type = packet.flags.type;
        packet.protectedPayload = Buffer.from(packet.protectedPayload.slice(0, -32));
        packet.signature = packet.protectedPayload.slice(-32);

        // Lets decrypt the data when the payload is encrypted
        if (packet.protectedPayload) {
            const protectedStructure = this.packet[packet.type];
            const decryptedPayload = crypto.decrypt(packet.protectedPayload, crypto.encrypt(this.packetData.slice(0, 16), crypto.getIv()));
            const decryptedPacket = new PacketStructure(decryptedPayload);

            packet.decryptedPayload = new PacketStructure(decryptedPayload).toBuffer();
            packet.structure = protectedStructure;
            packet.protectedPayload = {};

            for (const name in protectedStructure) {
                packet.protectedPayload[name] = protectedStructure[name].unpack(decryptedPacket);
            };
        };

        return packet;
    };
};
module.exports = MESSAGE;
