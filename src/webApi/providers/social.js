'use strict';
const axios = require('axios');

class SOCIAL {
    constructor(authorizationHeaders) {
        const headers = authorizationHeaders;

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getFriends() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://social.xboxlive.com/users/me/summary`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = SOCIAL;