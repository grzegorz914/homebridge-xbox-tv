"use strict";

class STRUCTURE {
    constructor(packet) {
        packet = !packet ? Buffer.from('') : packet;
        this.packet = packet;
        this.totalLength = packet.length;
        this.offset = 0;
    };

    writeSGString(data) {
        if (typeof data !== 'string') {
            throw new Error('data must be a string');
        }
        if (data.length > 65535) {
            throw new Error('data exceeds the maximum allowed length');
        }

        const stringLengthBuffer = Buffer.allocUnsafe(2);
        stringLengthBuffer.writeUInt16BE(data.length, 0);
        const dataBuffer = Buffer.from(data + '\x00');
        try {
            this.add(Buffer.concat([stringLengthBuffer, dataBuffer]));
        } catch (error) {
            console.error(`Error writing SGString: ${error}`);
        }
        return this;
    };

    readSGString() {
        let stringData = '';
        try {
            const stringLength = this.readUInt16();
            const stringBuffer = this.packet.slice(this.offset, this.offset + stringLength);
            this.offset += stringLength + 1;
            stringData = stringBuffer.toString('utf8');
        } catch (error) {
            console.error(`Error reading string from packet: ${error}`);
        }
        return stringData;
    };

    writeBytes(data, type) {
        try {
            const dataBuffer = Buffer.from(data, type);
            this.add(dataBuffer);
        } catch (error) {
            console.error(`Error writing Bytes: ${error}`);
        }
        return this;
    };

    readBytes(length = false) {
        let rawData = '';
        try {
            if (!length) {
                rawData = this.packet.slice(this.offset);
                this.offset = this.totalLength;
            } else {
                rawData = this.packet.slice(this.offset, this.offset + length);
                this.offset += length;
            }
        } catch (error) {
            console.error(`Error reading data from packet: ${error}`);
        }
        return rawData;
    };

    writeUInt8(data) {
        if (data < 0 || data > 255) {
            throw new Error('data must be a valid unsigned 8-bit integer');
        }
        const uint8Buffer = Buffer.allocUnsafe(1);
        uint8Buffer.writeUInt8(data, 0);
        try {
            this.add(uint8Buffer);
        } catch (error) {
            console.error(`Error writing UInt8 data: ${error}`);
        }
        return this;
    };

    readUInt8() {
        let uint8 = 0;
        try {
            uint8 = this.packet.readUInt8BE(this.offset);
            this.offset += 1;
        } catch (error) {
            console.error(`Error reading unsigned 8-bit integer from packet: ${error}`);
        }
        return uint8;
    };

    writeUInt16(data) {
        if (data < 0 || data > 65535) {
            throw new Error('data must be a valid unsigned 16-bit integer');
        }
        const uint16Buffer = Buffer.allocUnsafe(2);
        uint16Buffer.writeUInt16BE(data, 0);
        try {
            this.add(uint16Buffer);
        } catch (error) {
            console.error(`Error writing UInt16 data: ${error}`);
        }
    };

    readUInt16() {
        let uint16 = 0;
        try {
            uint16 = this.packet.readUInt16BE(this.offset);
            this.offset += 2;
        } catch (error) {
            console.error(`Error reading unsigned 16-bit integer from packet: ${error}`);
        }
        return uint16;
    };

    writeUInt32(data) {
        if (data < 0 || data > 4294967295) {
            throw new Error('data must be a valid unsigned 32-bit integer');
        }
        const uint32Buffer = Buffer.allocUnsafe(4);
        uint32Buffer.writeUInt32BE(data, 0);
        try {
            this.add(uint32Buffer);
        } catch (error) {
            console.error(`Error writing UInt32 data: ${error}`);
        }
    };

    readUInt32() {
        let uint32 = 0;
        try {
            uint32 = this.packet.readUInt32BE(this.offset);
            this.offset += 4;
        } catch (error) {
            console.error(`Error reading unsigned 32-bit integer from packet: ${error}`);
        }
        return uint32;
    };

    writeInt32(data) {
        if (data < -2147483648 || data > 2147483647) {
            throw new Error('data must be a valid signed 32-bit integer');
        }
        const int32Buffer = Buffer.allocUnsafe(4);
        int32Buffer.writeInt32BE(data, 0);
        try {
            this.add(int32Buffer);
        } catch (error) {
            console.error(`Error writing Int32 data: ${error}`);
        }
        return this;
    };

    readInt32() {
        let int32 = 0;
        try {
            int32 = this.packet.readInt32BE(this.offset);
            this.offset += 4;
        } catch (error) {
            console.error(`Error reading signed 32-bit integer from packet: ${error}`);
        }
        return int32;
    };

    readUInt64() {
        let uint64 = 0;
        try {
            const rawData = this.readBytes(8);
            uint64 = Buffer.from(rawData).readUIntBE(0, 8);
        } catch (error) {
            console.error(`Error reading unsigned 64-bit integer from packet: ${error}`);
        }
        return uint64;
    };

    toBuffer() {
        return this.packet;
    };

    add(data) {
        try {
            if (!Buffer.isBuffer(data)) {
                throw new Error('Data must be a Buffer object');
            }
            this.packet = Buffer.concat([this.packet, data]);
        } catch (error) {
            console.error(`Error adding data to packet: ${error}`);
        }
    };
};
module.exports = STRUCTURE;