// While the device cannot be reached every read of the accessory fails with a communication error, so the Home app shows the accessory
// as not responding and decides itself what to do with it. The plugin does not pretend any state of the device.
export const applyReachability = (accessory, hap, isReachable) => {
    for (const service of accessory.services) {
        for (const characteristic of service.characteristics) {
            const handler = characteristic.getHandler;
            if (typeof handler !== 'function') continue;

            characteristic.getHandler = async (...args) => {
                if (!isReachable()) throw new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                return handler.apply(characteristic, args);
            };
        }
    }
};
