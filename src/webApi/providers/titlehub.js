import axios from 'axios';

class TitleHub {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;

        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
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
                const response = await this.axiosInstance(url);
                resolve(response.data);
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
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
export default TitleHub;