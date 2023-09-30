'use strict';
const QueryString = require('querystring')
const axios = require('axios');

class GAMECLIP {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;
        headers['x-xbl-contract-version'] = '1';

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getUserGameclips() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://gameclipsmetadata.xboxlive.com/users/me/clips`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getCommunityGameclipsByTitleId(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://gameclipsmetadata.xboxlive.com/public/titles/${titleId}clips/saved?qualifier=created`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getGameclipsByXuid(titleId, skipItems, maxItems) {
        return new Promise(async (resolve, reject) => {
            try {
                const params = {
                    skipitems: skipItems || 0,
                    maxitems: maxItems || 25,
                }

                if (titleId !== undefined) {
                    params.titleid = titleId
                }

                const queryParams = QueryString.stringify(params);
                const url = `https://gameclipsmetadata.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/clips?${queryParams}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = GAMECLIP;