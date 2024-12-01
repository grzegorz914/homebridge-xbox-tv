import axios from 'axios';

class Messages {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        const headers = authorizationHeaders;
        
         //create axios instance
         this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
    }

    getInbox() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://xblmessaging.xboxlive.com/network/Xbox/users/me/inbox`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });

    }

    getConversation() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://xblmessaging.xboxlive.com/network/Xbox/users/me/conversations/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})?maxItems=100`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
export default Messages;