import express from "express";
import { Request, Response } from "express";
import moment from "moment";
import { DB } from "../db";
import { Merchant } from "../models/merchant";
import { Code, Model } from "../models/model";


export function MerchantRouter(db: DB){
  const router = express.Router();
  const model = new Merchant(db);
  const controller = new MerchantController(db);

  // The order matters
  router.get('/G/deliverSchedules', (req, res) => { controller.gv1_getDeliverySchedule(req, res); });
  router.get('/G/available', (req, res) => { controller.gv1_getAvailableMerchants(req, res); });
  router.get('/G/:id', (req, res) => { controller.gv1_get(req, res); });
  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });

  // v2
  router.get('/v2/myMerchants', (req, res) => { controller.gv1_getAvailableMerchants(req, res); });
  router.get('/v2/mySchedules', (req, res) => { controller.getMySchedules(req, res); })
  router.get('/getByAccountId', (req, res) => { controller.getByAccountId(req, res); });
  router.post('/load', (req, res) => { controller.load(req, res); });

  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });

  // food delivery
  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/available', (req, res) => { controller.fv1_getAvailableMerchants(req, res); });

  // v1
  // router.post('/', (req, res) => { model.create(req, res); });
  // router.put('/', (req, res) => { model.replace(req, res); });
  // router.patch('/', (req, res) => { model.update(req, res); });
  // router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
}

export class MerchantController extends Model {
  model: Merchant;
  constructor(db: DB) {
    super(db, 'merchants');
    this.model = new Merchant(db);
  }

  list(req: Request, res: Response) {
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    query = this.model.convertIdFields(query);

    this.model.joinFind(query).then((rs: any[]) => {
      // const rs: IMerchant[] = [];
      // ms.map(m => {
      //   rs.push(this.toBasicRspObject(m));
      // });
      res.setHeader('Content-Type', 'application/json');
      if (rs) {
        res.send(JSON.stringify(rs, null, 3));
      } else {
        res.send(JSON.stringify(null, null, 3))
      }
    });
  }

  getMySchedules(req: Request, res: Response) {
    let fields: any;
    let data: any;
    if (req.headers) {
      if (req.headers.filter && typeof req.headers.filter === 'string') {
        data = JSON.parse(req.headers.filter);
      }
      if (req.headers.fields && typeof req.headers.fields === 'string') {
        fields = JSON.parse(req.headers.fields);
      }
    }
    const merchantId = data.merchantId;
    const location = data.location;
    this.model.getMySchedules(location, merchantId, fields).then((rs: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(rs, null, 3));
    });
  }


  getByAccountId(req: Request, res: Response) {
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }
    const merchantAccountId = query.id;
    this.model.getByAccountId(merchantAccountId).then((rs: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      if (rs) {
        res.send(JSON.stringify(rs, null, 3));
      } else {
        res.send(JSON.stringify(null, null, 3))
      }
    });
  }

  quickFind(req: Request, res: Response) {
    let query = {};
    let fields: any;
    if (req.headers) {
      if (req.headers.filter && typeof req.headers.filter === 'string') {
        query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
      }
      if (req.headers.fields && typeof req.headers.fields === 'string') {
        fields = JSON.parse(req.headers.fields);
      }
    }

    this.model.find(query, null, fields).then((xs: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(xs, null, 3));
    });
  }


  get(req: Request, res: Response) {
    const id = req.params.id;
    let fields: any;
    if (req.headers) {
      if (req.headers.fields && typeof req.headers.fields === 'string') {
        fields = JSON.parse(req.headers.fields);
      }
    }

    this.model.findOne({ _id: id }).then((r: any) => {
      if (r) {
        const it = this.model.filter(r, fields);
        res.send(JSON.stringify(it, null, 3));
      } else {
        res.send(JSON.stringify(null, null, 3))
      }
    });
  }


  // load restaurants
  // origin --- ILocation object
  // dateType --- string 'today', 'tomorrow'
  load(req: Request, res: Response) {
    const origin = req.body.origin;
    const dateType = req.body.dateType;
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }
    
    const dt = dateType === 'today' ? moment() : moment().add(1, 'days');
    this.model.loadByDeliveryInfo(query, dt, origin).then((rs: any) => {
      if (rs) {
        res.send(JSON.stringify(rs, null, 3));
      } else {
        res.send(JSON.stringify(null, null, 3))
      }
    });
  }

  gv1_list(req: Request, res: Response) {
    const status = req.query.status;
    const query = status ? {status} : {};

    this.model.joinFind(query).then((merchants: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: merchants 
      }));
    });
  }

  gv1_get(req: Request, res: Response) {
    const id = req.params.id;
    this.model.getById(id).then(merchant => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: merchant ? Code.SUCCESS : Code.FAIL,
        data: merchant 
      }));
    });
  }

  // myLocalTime --- eg. '2020-04-23T10-09-00'
  gv1_getDeliverySchedule(req: Request, res: Response) {
    const myLocalTime = `${req.query.dt}`;
    const merchantId = `${req.query.merchantId}`;

    const lat = +req.query.lat;
    const lng = +req.query.lng;

    this.model.getDeliverSchedule(myLocalTime, merchantId, lat, lng).then(schedules => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: schedules ? Code.SUCCESS : Code.FAIL,
        data: schedules 
      }));
    });
  }

  gv1_getAvailableMerchants(req: Request, res: Response) {
    const lat = +req.query.lat;
    const lng = +req.query.lng;
    const status = `${req.query.status}`;
    const query = status ? {status}: {};
    this.model.getAvailableMerchants(lat, lng, query).then((ms: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: ms ? Code.SUCCESS : Code.FAIL,
        data: ms 
      }));
    });
  }

  // ?query={where:{}, options}
  fv1_getAvailableMerchants(req: Request, res: Response) {
    const lat = +req.query.lat;
    const lng = +req.query.lng;
    const deliverDate = `${req.query.deliverDate}`;
    const status = `${req.query.status}`;
    const query = status ? {status}: {};
    this.model.getAvailableMerchants(lat, lng, query).then((ms: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: ms ? Code.SUCCESS : Code.FAIL,
        data: ms 
      }));
    });
  }

};