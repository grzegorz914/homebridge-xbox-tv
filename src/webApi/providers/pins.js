import axios from 'axios';

class Pins {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;
        headers['Content-Type'] = 'application/json';
       
         //create axios instance
         this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getPins(list = 'XBLPins') {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://eplists.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/lists/PINS/${list}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getSaveForLater() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://eplists.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/lists/PINS/SaveForLater`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
export default Pins;