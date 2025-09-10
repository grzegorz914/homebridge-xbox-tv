class Structure {
    constructor(packet) {
        this.packet = packet ? packet : Buffer.alloc(0);
        this.totalLength = this.packet.length;
        this.offset = 0;
    }

    writeSGString(data) {
        if (typeof data !== 'string') {
            throw new Error('data must be a string');
        }

        const dataLength = Buffer.byteLength(data, 'utf8');
        if (dataLength > 65535) {
            throw new Error('data exceeds the maximum allowed length');
        }

        const stringLengthBuffer = Buffer.allocUnsafe(2);
        stringLengthBuffer.writeUInt16BE(dataLength, 0);

        const dataBuffer = Buffer.from(data, 'utf8');
        const nullTerminator = Buffer.from([0]);

        this.add(Buffer.concat([stringLengthBuffer, dataBuffer, nullTerminator]));
        return this;
    }

    readSGString() {
        const stringLength = this.readUInt16();
        const stringBuffer = this.packet.slice(this.offset, this.offset + stringLength);
        this.offset += stringLength + 1; // skip null terminator
        return stringBuffer.toString('utf8');
    }

    writeBytes(data, type) {
        const dataBuffer = Buffer.from(data, type);
        this.add(dataBuffer);
        return this;
    }

    readBytes(length = false) {
        let rawData;
        if (length === false) {
            rawData = this.packet.slice(this.offset);
            this.offset = this.totalLength;
        } else {
            rawData = this.packet.slice(this.offset, this.offset + length);
            this.offset += length;
        }
        return rawData;
    }

    writeUInt8(data) {
        if (data < 0 || data > 255) {
            throw new Error('data must be a valid unsigned 8-bit integer');
        }
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(data, 0);
        this.add(buf);
        return this;
    }

    readUInt8() {
        const value = this.packet.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    writeUInt16(data) {
        if (data < 0 || data > 65535) {
            throw new Error('data must be a valid unsigned 16-bit integer');
        }
        const buf = Buffer.allocUnsafe(2);
        buf.writeUInt16BE(data, 0);
        this.add(buf);
        return this;
    }

    readUInt16() {
        const value = this.packet.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    writeUInt32(data) {
        if (data < 0 || data > 0xFFFFFFFF) {
            throw new Error('data must be a valid unsigned 32-bit integer');
        }
        const buf = Buffer.allocUnsafe(4);
        buf.writeUInt32BE(data, 0);
        this.add(buf);
        return this;
    }

    readUInt32() {
        const value = this.packet.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    writeInt32(data) {
        if (data < -2147483648 || data > 2147483647) {
            throw new Error('data must be a valid signed 32-bit integer');
        }
        const buf = Buffer.allocUnsafe(4);
        buf.writeInt32BE(data, 0);
        this.add(buf);
        return this;
    }

    readInt32() {
        const value = this.packet.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    writeUInt64(value) {
        if (typeof value !== 'bigint') {
            throw new Error('value must be a BigInt');
        }
        const buf = Buffer.allocUnsafe(8);
        buf.writeUInt32BE(Number(value >> 32n), 0);
        buf.writeUInt32BE(Number(value & 0xFFFFFFFFn), 4);
        this.add(buf);
        return this;
    }

    readUInt64() {
        const high = this.packet.readUInt32BE(this.offset);
        const low = this.packet.readUInt32BE(this.offset + 4);
        this.offset += 8;
        return (BigInt(high) << 32n) | BigInt(low);
    }

    toBuffer() {
        return this.packet;
    }

    add(data) {
        if (!Buffer.isBuffer(data)) {
            throw new Error('Data must be a Buffer object');
        }
        this.packet = Buffer.concat([this.packet, data]);
        this.totalLength = this.packet.length;
    }
}

export default Structure;
