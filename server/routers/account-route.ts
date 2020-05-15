import express from "express";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { DB } from "../db";
import { Account, AccountAttribute, IAccount, AccountType } from "../models/account";
import { MerchantStuff } from "../merchant-stuff";
import { Utils } from "../utils";
import { Config } from "../config";
import { Model, Code } from "../models/model";
import { ObjectId } from "mongodb";

export function AccountRouter(db: DB) {
  const router = express.Router();
  const controller = new AccountController(db);
  
  // grocery api
  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });
  router.get('/G/:id', (req, res) => { controller.gv1_getById(req, res); });
  router.get('/G/token/:id', (req, res) => { controller.gv1_getByTokenId(req, res); });

  // v2 https://duocun.ca/api/Accounts/wechatLoginByOpenId
  router.post('/wechatLoginByOpenId', (req, res) => { controller.wechatLoginByOpenId(req, res); });
  router.get('/wechatLoginByCode', (req, res) => { controller.wechatLoginByCode(req, res); });
  router.get('/qFind', (req, res) => { controller.list(req, res); }); // deprecated
  router.get('/', (req, res) => { controller.list(req, res); });
  router.get('/current', (req, res) => { controller.getCurrentAccount(req, res); });

  // v1
  // router.get('/attributes', (req, res) => { this.attrModel.quickFind(req, res); });

  // v1
  router.get('/wechatLogin', (req, res) => { controller.wechatLogin(req, res); });
  // router.post('/verifyCode', (req, res) => { controller.verifyCode(req, res); }); // deprecated

  router.get('/:id', (req, res) => { controller.get(req, res); }); // fix me

  // router.post('/', (req, res) => { controller.create(req, res); });
  // router.put('/', (req, res) => { controller.replace(req, res); });
  router.patch('/', (req, res) => { controller.update(req, res); });
  // router.delete('/', (req, res) => { controller.remove(req, res); });

  // router.post('/sendClientMsg2', (req, res) => { controller.sendClientMsg2(req, res); });
  router.post('/sendClientMsg', (req, res) => { controller.sendClientMsg(req, res); });
  router.post('/verifyPhoneNumber', (req, res) => { controller.verifyPhoneNumber(req, res); });
  router.post('/sendVerifyMsg', (req, res) => { controller.sendVerifyMsg(req, res); });
  router.post('/applyMerchant', (req, res) => { controller.merchantStuff.applyMerchant(req, res); });
  router.post('/getMerchantApplication', (req, res) => { controller.merchantStuff.getApplication(req, res); });

  router.post('/login', (req, res) => { controller.login(req, res); });
  router.post('/loginByPhone', (req, res) => { controller.loginByPhone(req, res); });
  router.route('/signup').post((req, res) => { controller.signup(req, res); });
  router.post('/registerTempAccount', (req, res) => {controller.registerTempAccount(req, res)});
  router.post('/register', (req, res) => { controller.register(req, res) });
  // when an authenticated user tries to change phone number
  router.post('/sendVerificationCode', (req, res) => { controller.gv1_sendVerificationCode(req, res) });
  // when a user tries to log in with phone number
  router.post('/sendOTPCode', (req, res) => { controller.sendOTPCode(req, res) });
  router.post('/verifyCode', (req, res) => { controller.gv1_verifyCode(req, res) });
  router.post('/saveProfile', (req, res) => { controller.gv1_update(req, res) });
  return router;
};

export class AccountController extends Model {
  accountModel: Account;
  attrModel: AccountAttribute;
  merchantStuff: MerchantStuff;
  utils: Utils;
  cfg: Config;

  constructor(db: DB) {
    super(db, 'users');
    this.accountModel = new Account(db);
    this.attrModel = new AccountAttribute(db);
    this.merchantStuff = new MerchantStuff(db);
    this.utils = new Utils();
    this.cfg = new Config();
  }

  loginByPhone(req: Request, res: Response) {
    const phone = req.body.phone;
    const verificationCode = req.body.verificationCode;

    this.accountModel.doLoginByPhone(phone, verificationCode).then((tokenId: string) => {
      if (!tokenId) {
        return res.json({
          code: Code.FAIL
        });
      } else {
        return res.json({
          code: Code.SUCCESS,
          token: tokenId
        });
      }
    });
  }

  login(req: Request, res: Response) {
    const username = req.body.username;
    const password = req.body.password;

    this.accountModel.doLogin(username, password).then((tokenId: string) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(tokenId, null, 3));
    });
  }

  wechatLogin(req: Request, res: Response) {

    const authCode: any = req.query.code;
    res.setHeader('Content-Type', 'application/json');

    this.utils.getWechatAccessToken(authCode).then((r: any) => {
      this.utils.getWechatUserInfo(r.access_token, r.openid).then((x: any) => { // IAccount
        this.accountModel.doWechatSignup(x.openid, x.nickname, x.headimgurl, x.sex).then((account: IAccount) => {
          if (account) {
            const accountId = account._id.toString();
            const tokenId = this.accountModel.jwtSign(accountId);
            res.send(JSON.stringify(tokenId, null, 3));
          } else {
            res.send(JSON.stringify('', null, 3));
          }
        });
      }, err => {
        console.log(err);
        res.send(JSON.stringify('', null, 3));
      });
    }, err => {
      console.log(err);
      res.send(JSON.stringify('', null, 3));
    });
  }


  // return  {tokenId, accessToken, openId, expiresIn}
  wechatLoginByCode(req: Request, res: Response) {
    const wxLoginCode: any = req.query.code;
    res.setHeader('Content-Type', 'application/json');
    this.accountModel.wechatLoginByCode(wxLoginCode).then((r: any) => {
      if (r && r.tokenId) {
        res.send(JSON.stringify(r, null, 3));
      } else {
        res.send(JSON.stringify('', null, 3));
      }
    }).catch( (error:any) => {
      // even exception,  let user login again
      // console.log(`err: ${error}`);
      res.send(JSON.stringify('', null, 3));
    });
  }

  // return {tokenId}
  wechatLoginByOpenId(req: Request, res: Response) {
    const openId = req.body.openId;
    const accessToken = req.body.accessToken;

    res.setHeader('Content-Type', 'application/json');
    this.accountModel.wechatLoginByOpenId(accessToken, openId).then((tokenId: any) => {
      if (tokenId) {
        res.send(JSON.stringify({tokenId}, null, 3));
      } else {
        res.send(JSON.stringify('', null, 3));
      }
    }).catch( (error: any) => {
      // even exception,  let user login again
      // console.log(`err: ${error}`);
      res.send(JSON.stringify('', null, 3));
    });
  }


  // req --- require accountId, username and phone fields
  sendVerifyMsg(req: Request, res: Response) {
    const self = this;
    const lang = req.body.lang;
    const accountId = req.body.accountId;
    const phone = req.body.phone;

    this.accountModel.trySignupV2(accountId, phone).then((r: any) => {
      res.setHeader('Content-Type', 'application/json');
      if (r.phone) {
        const text = (lang === 'en' ? 'Duocun Verification Code: ' : '多村验证码: ') + r.verificationCode;
        this.accountModel.sendMessage(r.phone, text).then(() => {
          if (r.accountId) {
            const tokenId = this.accountModel.jwtSign(r.accountId);
            res.send(JSON.stringify(tokenId, null, 3));
          } else {
            res.send(JSON.stringify('', null, 3)); // sign up fail, please contact admin
          }
        });
      } else {
        res.send(JSON.stringify('', null, 3)); // sign up fail, please contact admin
      }
    });

  }

  verifyPhoneNumber(req: Request, res: Response) {
    const loggedInAccountId = req.body.accountId;
    const phone = req.body.phone;
    const code = req.body.code;

    this.accountModel.verifyPhoneNumber(phone, code, loggedInAccountId).then((r: any) => {
      this.accountModel.updateAccountVerified(r).then((ret) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(ret, null, 3));
      });
    });
  }

  sendClientMsg(req: Request, res: Response) {
    const self = this;
    const lang = req.body.lang;
    const phone = req.body.phone;
    const orderType = req.body.orderType;

    res.setHeader('Content-Type', 'application/json');

    let txt;
    if (orderType === 'G') {
      txt = lang === 'en' ? 'Reminder: Your delivery arrived.' : '多村提醒您: 货已送到, 请查收。(系统短信, 勿回)';
    } else {
      txt = lang === 'en' ? 'Reminder: Your delivery arrived.' : '多村提醒您: 餐已送到, 请查收。(系统短信, 勿回)';
    }

    self.accountModel.sendMessage(phone, txt).then(() => {
      res.send(JSON.stringify('', null, 3)); // sign up fail, please contact admin
    });
  }

  // v1 --- deprecated
  // verifyCode(req: Request, res: Response) {
  //   const phone = req.body.phone;
  //   let code = req.body.code;
  //   this.accountModel.doVerifyPhone(phone, code).then((verified) => {
  //     res.setHeader('Content-Type', 'application/json');
  //     res.send(JSON.stringify(verified, null, 3));
  //   });
  // }

  list(req: Request, res: Response) {
    let query = {};
    const params = req.query;

    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }
    query = this.accountModel.convertIdFields(query);

    if (params && params.keyword) {
      query = { username: {'$regex': params.keyword} };
    }

    this.accountModel.find(query).then(accounts => {
      accounts.forEach((account: any) => {
        if (account && account.password) {
          delete account.password;
        }
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(accounts);
    });
  }

  getCurrentAccount(req: Request, res: Response) {
    const tokenId: any = req.query.tokenId;

    this.accountModel.getAccountByToken(tokenId).then(account => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(account, null, 3));
    });
  }

  signup(req: Request, res: Response) {
    const phone = req.body.phone.toString();
    const code: string = req.body.verificationCode.toString();

    this.accountModel.doSignup(phone, code).then((account: any) => {
      res.setHeader('Content-Type', 'application/json');
      const tokenId = this.accountModel.jwtSign(account._id.toString());
      res.send(JSON.stringify(tokenId, null, 3));
    });
  }


  // gv1

  // optional --- status
  gv1_list(req: Request, res: Response) {
    const status = req.query.status;
    const query = status ? {status} : {};
    this.accountModel.find(query).then(accounts => {
      accounts.map((account: any) => {
        if (account && account.password) {
          delete account.password;
        }
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: accounts 
      }));
    });
  }

  // id
  gv1_getById(req: Request, res: Response) {
    const id = req.params.id;
    this.accountModel.getById(id).then(account => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: account ? Code.SUCCESS : Code.FAIL,
        data: account
      }));
    });
  }

  // id
  gv1_getByTokenId(req: Request, res: Response) {
    const tokenId: any = req.params.id;
    this.accountModel.getAccountByToken(tokenId).then(account => {
      if (account) {
        delete account.password;
        delete account.newPhone;
        delete account.verificationCode;
      }
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: account ? Code.SUCCESS : Code.FAIL,
        data: account
      }));
    });
  }

  async sendOTPCode(req: Request, res: Response) {
    let phone = req.body.phone;
    const account = await this.accountModel.findOne({phone});
    if (!account) {
      return res.json({
        code: Code.FAIL,
        message: "no such account"
      });
    }
    const code = this.accountModel.getRandomCode();
    account.verificationCode = code;
    try {
      await this.accountModel.updateOne({_id: account._id}, account);
      await this.accountModel.sendMessage(account.phone, account.verificationCode);
    } catch (e) {
      return res.json({
        code: Code.FAIL,
        message: e
      });
    }
    return res.json({
      code: Code.SUCCESS
    });
  }

  async gv1_sendVerificationCode(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    let token: string = req.get('Authorization') || "";
    token = token.replace("Bearer ", "");
    const cfg = new Config();
    let accountId = "";
    try {
      accountId = jwt.verify(token, cfg.JWT.SECRET).toString();
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "authentication failed"
      }));
    }
    let newPhone = req.body.phone;
    if (!newPhone) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "phone number missing"
      }));
    }
    const account = await this.accountModel.findOne({_id: new ObjectId(accountId)});
    if (!account) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "no such account"
      }));
    }
    newPhone = newPhone.substring(0,2) === "+1" ? newPhone.substring(2) : newPhone;
    account.newPhone = newPhone;
    const code = this.accountModel.getRandomCode();
    account.verificationCode = code;
    try {
      await this.accountModel.sendMessage(account.newPhone, account.verificationCode);
      await this.accountModel.updateOne({ _id: accountId }, account);
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: e
      }));
    }
    res.send(JSON.stringify({
      code: Code.SUCCESS,
      /**
       * for development purpose only
       */
      // message: account.verificationCode
    }));
  }

  async gv1_verifyCode(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    let token: string = req.get('Authorization') || "";
    token = token.replace("Bearer ", "");
    const cfg = new Config();
    let accountId = "";
    try {
      accountId = jwt.verify(token, cfg.JWT.SECRET).toString();
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "authentication failed"
      }));
    }
    let newPhone = req.body.newPhone;
    let code = req.body.code;
    if (!newPhone || !code) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "phone number or verification code is missing"
      }));
    }
    const account = await this.accountModel.findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "no such account"
      }));
    }
    if (account.newPhone == newPhone && account.verificationCode == code) {
      account.phone = account.newPhone;
      delete(account.newPhone);
      delete(account.verficationCode);
      account.verified = true;
      await this.accountModel.updateOne({ _id: accountId }, account);
      return res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: account
      }));
    } else {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        /**
         * for development purpose only
         */
        // data: account
      }));
    }
  }

  async gv1_update(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    let token: string = req.get('Authorization') || "";
    token = token.replace("Bearer ", "");
    const cfg = new Config();
    let accountId = "";
    try {
      accountId = jwt.verify(token, cfg.JWT.SECRET).toString();
    } catch (e) {
      console.error(e);
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "authentication failed"
      }));
    }
    const account = await this.accountModel.findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "no such account"
      }));
    }
    let { location, secondPhone } = req.body;
    account.location = location;
    if (!location) {
      account.location = null;
    }
    if (secondPhone) {
      secondPhone = secondPhone.substring(0,2) === "+1" ? secondPhone.substring(2) : secondPhone;
      account.secondPhone = secondPhone;
    }
    try {
      await this.accountModel.updateOne({ _id: new ObjectId(accountId) }, account);
      return res.send(JSON.stringify({
        code: Code.SUCCESS
      }));
    } catch(e) {
      return res.send(JSON.stringify({
        code: Code.FAIL,
        message: "save failed"
      }));
    }
  }

  async registerTempAccount(req: Request, res: Response) {
    let phone = req.body.phone;
    if (!phone) {
      return res.json({
        code: Code.FAIL,
        message: "phone number is empty"
      });
    }
    phone = phone.substring(0, 2) === "+1" ? phone.substring(2): phone;
    const existing = await this.accountModel.findOne({phone, type: { $ne: AccountType.TEMP }});
    if (existing) {
      return res.json({
        code: Code.FAIL,
        message: "phone number already exists"
      });
    }
    const user = {
      phone,
      verificationCode: this.accountModel.getRandomCode(),
      type: AccountType.TEMP,
      verified: false
    };
    try {
      let twilio = await this.accountModel.sendMessage(user.phone, user.verificationCode);
      console.log(twilio);
      await this.accountModel.updateOne({ phone }, user, { upsert: true });
    } catch(e) {
      return res.json({
        code: Code.FAIL,
        message: e
      });
    }
    return res.json({
      code: Code.SUCCESS
    });
  }

  async register(req: Request, res: Response) {
    let phone = req.body.phone;
    phone = phone.substring(0, 2) === "+1" ? phone.substring(2): phone;
    const username = req.body.username;
    const verificationCode = req.body.verificationCode;
    if (!username) {
      return res.json({
        code: Code.FAIL,
        message: "username is empty"
      });
    }
    
    const user = await this.accountModel.findOne({ phone, verificationCode, type: AccountType.TEMP });
    if (!user) {
      return res.json({
        code: Code.FAIL
      });
    }
    const existing = await this.accountModel.findOne({ phone, type: { $ne: AccountType.TEMP } });
    if (existing) {
      return res.json({
        code: Code.FAIL,
        message: "phone number already exists"
      });
    }
    user.username = username;
    user.verified = true;
    user.type = AccountType.CLIENT;
    if (!user.balance) {
      user.balance = 0;
    }
    try {
      await this.accountModel.updateOne({ _id: user._id }, user);
    } catch (e) {
      return res.json({
        code: Code.FAIL,
        message: e
      });
    }
    return res.json({
      code: Code.SUCCESS,
      token: jwt.sign(user._id.toString(), this.cfg.JWT.SECRET)
    });
  }

}
