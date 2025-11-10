import HexToBin from 'hex-to-binary';
import Packets from './packets.js';
import Structure from './structure.js';
import { LocalApi } from '../constants.js';

class Message {
    constructor(type) {
        this.type = type;
        this.packets = new Packets();
        this.packet = this.packets[type];
        this.channelId = '\x00\x00\x00\x00\x00\x00\x00\x00';
    }

    readFlags(flags) {
        const binaryFlag = HexToBin(flags.toString('hex'));
        const version = parseInt(binaryFlag.slice(0, 2), 2);
        const needAcknowlegde = binaryFlag.slice(2, 3) === '1';
        const isFragment = binaryFlag.slice(3, 4) === '1';
        const type = LocalApi.Messages.Types[parseInt(binaryFlag.slice(4, 16), 2)];
        return { version, needAcknowlegde, isFragment, type };
    }

    set(key, value, subkey = false) {
        if (subkey === false) {
            this.packet[key].value = value;
        } else {
            this.packet[subkey][key].value = value;
        }
    }

    pack(crypto, sequenceNumber, targetParticipantId, sourceParticipantId, channelId = false) {
        const structure = new Structure();
        for (const name in this.packet) {
            this.packet[name].pack(structure);
        }

        // Padding PKCS7
        if (structure.toBuffer().length % 16 > 0) {
            const padStart = structure.toBuffer().length % 16;
            const padTotal = 16 - padStart;
            for (let i = padStart + 1; i <= 16; i++) {
                structure.writeUInt8(padTotal);
            }
        }

        const header = new Structure();
        header.writeBytes(Buffer.from('d00d', 'hex'));
        header.writeUInt16(structure.toBuffer().length);
        header.writeUInt32(sequenceNumber);
        header.writeUInt32(targetParticipantId);
        header.writeUInt32(sourceParticipantId);
        header.writeBytes(LocalApi.Messages.Flags[this.type]);
        header.writeBytes(Buffer.from(channelId || this.channelId));

        const payloadEncrypted = crypto.encrypt(structure.toBuffer(), crypto.getKey(), crypto.encrypt(header.toBuffer().subarray(0, 16), crypto.getIv()));
        let packet = Buffer.concat([header.toBuffer(), payloadEncrypted]);
        const payloadProtected = crypto.sign(packet);
        return Buffer.concat([packet, Buffer.from(payloadProtected)]);
    }

    unpack(crypto = undefined, data = false) {
        const structure = new Structure(data);
        const typeHex = structure.readBytes(2).toString('hex');

        let packet = {
            typeHex,
            payloadLength: structure.readUInt16(),
            sequenceNumber: structure.readUInt32(),
            targetParticipantId: structure.readUInt32(),
            sourceParticipantId: structure.readUInt32(),
            flags: this.readFlags(structure.readBytes(2)),
            channelId: structure.readBytes(8),
            payloadProtected: structure.readBytes()
        };

        packet.type = packet.flags.type;
        packet.payloadProtected = Buffer.from(packet.payloadProtected.subarray(0, -32));
        packet.signature = packet.payloadProtected.subarray(-32);
        this.type = packet.type;
        this.channelId = packet.channelId;

        if (packet.payloadProtected.length > 0 && crypto) {
            const payloadDecrypted = crypto.decrypt(packet.payloadProtected, crypto.encrypt(data.subarray(0, 16), crypto.getIv()));
            const structurePayloadProtected = new Structure(payloadDecrypted);
            packet.payloadDecrypted = structurePayloadProtected.toBuffer();
            packet.payloadProtected = {};

            const packetDef = this.packets[packet.type];
            if (packetDef) {
                for (const name in packetDef) {
                    packet.payloadProtected[name] = packetDef[name].unpack(structurePayloadProtected);
                }
            }
        }

        return packet;
    }
}

export default Message;
