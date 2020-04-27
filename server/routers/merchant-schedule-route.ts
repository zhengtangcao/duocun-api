import express, { Request, Response } from "express";
import { DB } from "../db";
import { MerchantSchedule } from "../models/merchant-schedule";
import { Model, Code } from "../models/model";
import { Area, AppType } from "../models/area";

export function MerchantScheduleRouter(db: DB){
  const router = express.Router();
  const model = new MerchantSchedule(db);
  const controller = new MerchantScheduleController(db);


  router.get('/G/', (req, res) => { controller.gv1_getSchedules(req, res); });

  // v2
  router.patch('/cu', (req, res) => { controller.createOrUpdate(req, res); });
  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  

  // v1
  router.get('/availableMerchants', (req, res) => { controller.getAvailableMerchants(req, res); });
  router.get('/availables', (req, res) => { controller.getAvailableSchedules(req, res); });

  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });
  
  router.post('/', (req, res) => { model.create(req, res); });

  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};

export class MerchantScheduleController extends Model {
  model: MerchantSchedule;
  areaModel: Area;
  constructor(db: DB) {
    super(db, 'merchant_schedules');
    this.model = new MerchantSchedule(db);
    this.areaModel = new Area(db);
  }

  createOrUpdate(req: Request, res: Response) {
    const self = this;
    const data = req.body;
    this.model.createOrUpdate(data).then(() => {
      setTimeout(() => {
        self.model.find({}).then(ms => {
          res.send(JSON.stringify(ms, null, 3));
        });
      }, 500);
    });
  }

  getAvailableSchedules(req: Request, res: Response) {
    let fields: any;
    let data: any;
    if (req.headers) {
      if (req.headers.data && typeof req.headers.data === 'string') {
        data = JSON.parse(req.headers.data);
      }
      if (req.headers.fields && typeof req.headers.fields === 'string') {
        fields = JSON.parse(req.headers.fields);
      }
    }
    
    const merchantId = data.merchantId;
    const location = data.location;
    // const query = appType ? {appType} : {};
    this.areaModel.getMyArea(location, AppType.GROCERY).then((area: any) => {
      if(area){
        const areaId = area._id.toString();
        this.find({merchantId, areaId}).then(mss =>{
          res.send(JSON.stringify(mss, null, 3));
        });
      }else{
        res.send(JSON.stringify(null, null, 3));
      }
    });
  }


  getAvailableMerchants(req: Request, res: Response) {
    let data: any;
    if (req.headers) {
      if (req.headers.data && typeof req.headers.data === 'string') {
        data = JSON.parse(req.headers.data);
      }
    }
    
    const areaId = data.areaId;
    this.find({areaId}).then(mss =>{
      if(mss && mss.length > 0){
        const merchantIds = mss.map((ms: any) => ms.merchantId.toString());
        res.send(JSON.stringify(merchantIds));
      }else{
        res.send(JSON.stringify(null));
      }
    });
  }

  gv1_getSchedules(req: Request, res: Response) {
    const lat = +req.query.lat; // mandatory
    const lng = +req.query.lng; // mandatory
    const merchantId = req.query.merchantId;
    const query = req.query.status ? {status: req.query.status} : {};

    this.areaModel.getMyArea({lat, lng}, AppType.GROCERY).then((area: any) => {
      if(area){
        const areaId = area._id.toString();
        const q = merchantId ? {...query, merchantId, areaId} : {...query, areaId};
        this.find(q).then(mss =>{
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify({
            code: Code.SUCCESS,
            data: mss 
          }));
        });
      }else{
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
          code: Code.FAIL,
          data: [] 
        }));
      }
    });
  }
}