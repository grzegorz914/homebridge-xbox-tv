"use strict";
const EventEmitter = require('events');

class ImpulseGenerator extends EventEmitter {
    constructor() {
        super();
        this.timersState = false;
    }

    async start(timers) {
        if (this.timersState) {
            await this.stop();
        }

        this.timers = [];
        for (const timer of timers) {
            const newTimer = setInterval(() => {
                this.emit(timer.name);
            }, timer.sampling);
            this.timers.push(newTimer);
        };

        //update state
        this.timersState = true;
        this.state();

        return true;
    }

    async stop() {
        if (this.timersState) {
            this.timers.forEach(timer => clearInterval(timer));
        }

        //update state
        this.timers = [];
        this.timersState = false;
        this.state();

        return true;
    }

    state() {
        this.emit('state', this.timersState);
        return this.timersState;
    }
}
module.exports = ImpulseGenerator;
