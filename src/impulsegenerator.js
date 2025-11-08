import EventEmitter from 'events';

class ImpulseGenerator extends EventEmitter {
    constructor() {
        super();
        this.timersState = false;
        this.timers = [];
    }

    async state(state, timers = [], runOnStart = true) {
        // Stop current timers before new start
        if (this.timersState && state) {
            await this.state(false);
        }

        if (state) {
            if (!Array.isArray(timers)) throw new Error('Timers must be an array');

            for (const { name, sampling } of timers) {
                if (!name || !sampling) continue;

                if (runOnStart) this.emit(name);

                const interval = setInterval(() => {
                    this.emit(name);
                }, sampling);

                this.timers.push(interval);
            }
        } else {
            this.timers.forEach(clearInterval);
            this.timers = [];
        }

        this.timersState = state;
        this.emit('state', state);
        return true;
    }
}

export default ImpulseGenerator;

