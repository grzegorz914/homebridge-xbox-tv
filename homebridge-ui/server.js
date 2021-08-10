const {
  HomebridgePluginUiServer,
  RequestError
} = require('@homebridge/plugin-ui-utils');
const XboxWebApi = require('xbox-webapi');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    // super() MUST be called first
    super();

    // handle request for the /data route
    this.onRequest('/data', this.getData.bind(this));

    // this MUST be called when you are ready to accept requests
    this.ready();
  }

  async getData(payload) {
    console.log('Incomming token %s:, host: %s.', payload.token, payload.host);

    try {
      const token = payload.token;
      const host = payload.host;
      const clientId = payload.clientId;
      const clientSecret = payload.clientSecret;
      const authTokenFile = '/var/lib/homebridge/xboxTv/authToken_' + host.split('.').join('');

      this.xboxWebApi = XboxWebApi({
        clientId: clientId,
        clientSecret: clientSecret,
        userToken: '',
        uhs: '',
      });

      this.xboxWebApi._authentication._tokensFile = authTokenFile;
      this.xboxWebApi.isAuthenticated().then(() => {
        this.obj = new Array();
        const obj = {
          'token': 'Console already authenticated',
          'status': 0
        }
        this.obj.push(obj);
      }).catch(() => {
        if (token != undefined) {
          this.xboxWebApi._authentication.getTokenRequest(token).then((authToken) => {
            this.xboxWebApi._authentication._tokens.oauth = authToken;
            this.xboxWebApi._authentication.saveTokens();
            this.obj = new Array();
            const obj = {
              'token': 'Console successfully authenticated and sutToken file stored',
              'status': 3
            }
            this.obj.push(obj)
          }).catch((error) => {
            this.obj = new Array();
            const obj = {
              'token': 'Authorization and Token file saved error.',
              'status': 4
            }
            this.obj.push(obj);
          });
        } else {
          this.obj = new Array();
          const obj = {
            'token': 'Authorization link empty, check authToken file.',
            'status': 2
          }
          this.obj.push(obj);
        }
        const oauth2URI = this.xboxWebApi._authentication.generateAuthorizationUrl();
        this.obj = new Array();
        const obj = {
          'token': oauth2URI,
          'status': 1
        }
        this.obj.push(obj);
      });

      const data = this.obj[0].token;
      const status = this.obj[0].status
      console.log('Outgoing data: %s:, status: %s.', data, status);
      return {
        data: data,
        status: status
      }

    } catch (e) {
      throw new RequestError('Failed to return data try again.', {
        message: e.message
      });
    }

  }
}

(() => {
  return new PluginUiServer();
})();