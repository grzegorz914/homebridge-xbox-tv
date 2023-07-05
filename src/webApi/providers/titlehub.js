'use strict';
const HttpClient = require('../httpclient.js');

class TITLEHUB {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        this.headers = authorizationHeaders;
        this.httpClient = new HttpClient();
    }

    getTitleHistory() {
        return new Promise(async (resolve, reject) => {
            try {
                const params = [
                    'achievement',
                    'image',
                    'scid',
                ]

                const url = `https://titlehub.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/titles/titlehistory/decoration/${params.join(',')}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getTitleId(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const params = [
                    'achievement',
                    'image',
                    'detail',
                    'scid',
                    'alternateTitleId'
                ]

                const url = `https://titlehub.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/titles/titleid(${titleId})/decoration/${params.join(',')}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = TITLEHUB;