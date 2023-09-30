'use strict';
const QueryString = require('querystring')
const axios = require('axios');

class CATALOG {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;
        headers['x-xbl-contract-version'] = '5';

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getUserScreenshots() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://screenshotsmetadata.xboxlive.com/users/me/screenshot`;
                const response = await this.axiosInstance(url);
                resolve(response,data);
            } catch (error) {
                reject(error);
            };
        });

    }

    getCommunityScreenshotsByTitleId(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://screenshotsmetadata.xboxlive.com/public/titles/${titleId}/screenshots?qualifier=created&maxItems=10`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    getScreenshotsByXuid(titleId, skipItems, maxItems) {
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
                const url = `https://screenshotsmetadata.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/screenshots?${queryParams}`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = CATALOG;