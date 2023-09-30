'use strict';
const axios = require('axios');

class USERSTATS {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;
        headers['x-xbl-contract-version'] = '2';

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getUserTitleStats(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://userstats.xboxlive.com/batch`;
                const params = `{"arrangebyfield":"xuid","xuids":["${this.tokens.xsts.DisplayClaims.xui[0].xid}"],"groups":[{"name":"Hero","titleId":"${titleId}"}],"stats":[{"name":"MinutesPlayed","titleId":"${titleId}"}]}`;
                const response = await this.httpClient.request('POST', url, this.headers, params);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = USERSTATS;
