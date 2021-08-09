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
      this.xboxWebApi = XboxWebApi({
        clientId: '5e5ead27-ed60-482d-b3fc-702b28a97404',
        clientSecret: '',
        userToken: '',
        uhs: '',
      });

      this.authTokenFile = '/var/lib/homebridge/xboxTv/authToken_' + payload.host.split('.').join('');
      this.xboxWebApi._authentication._tokensFile = this.authTokenFile;
      this.xboxWebApi.isAuthenticated().then(() => {
        this.obj = new Array();
        const obj = {
          'token': payload.token,
          'status': 0
        }
        this.obj.push(obj);
      }).catch(() => {
        const oauth2URI = this.xboxWebApi._authentication.generateAuthorizationUrl();
        this.obj = new Array();
        const obj = {
          'token': oauth2URI,
          'status': 1
        }
        this.obj.push(obj);
        if (payload.token != undefined) {
          this.xboxWebApi._authentication.getTokenRequest(payload.token).then((data) => {
            this.xboxWebApi._authentication._tokens.oauth = data;
            this.xboxWebApi._authentication.saveTokens();
            this.obj = new Array();
            const obj = {
              'token': payload.data,
              'status': 3
            }
            this.obj.push(obj);
          }).catch((error) => {
            this.obj = new Array();
            const obj = {
              'token': payload.token,
              'status': 4
            }
            this.obj.push(obj);
          });
        } else {
          this.obj = new Array();
          const obj = {
            'token': payload.token,
            'status': 2
          }
          this.obj.push(obj);
        }
      });

      const data = this.obj[0].token;
      const status = this.obj[0].status;
      return {
        data: data,
        status: status
      }
    } catch (e) {
      throw new RequestError('Failed to Generate Token', {
        message: e.message
      });
    }

  }
}

(() => {
  return new PluginUiServer();
})();