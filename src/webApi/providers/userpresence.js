'use strict';
import axios from 'axios';

class UserPresence {
    constructor(authorizationHeaders) {
        const headers = authorizationHeaders;
        headers['x-xbl-contract-version'] = '3';

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getCurrentUser() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://userpresence.xboxlive.com/users/me?level=all`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
export default UserPresence;