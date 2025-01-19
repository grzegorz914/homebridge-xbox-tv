import EventEmitter from 'events';

class ImpulseGenerator extends EventEmitter {
    constructor() {
        super();
        this.timersState = false;
    }

    async start(timers) {
        if (this.timersState) {
            this.state(true);
            return true;
        }

        this.timers = [];
        for (const timer of timers) {
            this.emit(timer.name);

            const newTimer = setInterval(() => {
                this.emit(timer.name);
            }, timer.sampling);
            this.timers.push(newTimer);
        };

        //update state
        this.state(true);
        return true;
    }

    async stop() {
        if (!this.timersState) {
            this.state(false);
            return true;
        }

        //update state
        this.timers.forEach(timer => clearInterval(timer));
        this.timers = [];
        this.state(false);
        return true
    }

    state(state) {
        this.timersState = state;
        this.emit('state', state);
    }
}
export default ImpulseGenerator;

