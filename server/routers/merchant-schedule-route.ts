import express, { Request, Response } from "express";
import { DB } from "../db";
import { MerchantSchedule } from "../models/merchant-schedule";
import { Model } from "../models/model";

export function MerchantScheduleRouter(db: DB){
  const router = express.Router();
  const model = new MerchantSchedule(db);
  const controller = new MerchantScheduleController(db);

  // v2
  router.patch('/cu', (req, res) => { controller.createOrUpdate(req, res); });
  router.get('/qFind', (req, res) => { model.quickFind(req, res); });

  // v1
  router.get('/availableMerchants', (req, res) => { model.getAvailableMerchants(req, res); });
  router.get('/availables', (req, res) => { model.getAvailableSchedules(req, res); });
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

  constructor(db: DB) {
    super(db, 'merchant_schedules');
    this.model = new MerchantSchedule(db);
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
}