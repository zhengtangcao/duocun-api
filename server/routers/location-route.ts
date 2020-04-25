import express, {Request, Response} from "express";
import { DB } from "../db";
import { Location, IGooglePlace } from "../models/location";
import { Model, Code } from "../models/model";

export function LocationRouter(db: DB){
  const router = express.Router();
  const model = new Location(db);
  const controller = new LocationController(db);

  // yaml api
  router.get('/geocode/:address', (req, res) => { controller.getGeocodeList(req, res); });
  router.get('/place/:input', (req, res) => { controller.getPlaceList(req, res); });


  // old api
  router.get('/suggest/:keyword', (req, res) => { model.reqSuggestAddressList(req, res)});
  router.get('/history', (req, res) => { model.reqHistoryAddressList(req, res)});
  router.get('/query', (req, res) => { model.reqLocation(req, res)});

  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });
  router.get('/Places/:input', (req, res) => { model.reqPlaces(req, res); });

  router.get('/Geocodes/:address', (req, res) => { model.reqGeocodes(req, res); });
  router.post('/upsertOne', (req, res) => { model.upsertOne(req, res); });
  router.post('/', (req, res) => { model.create(req, res); });


  router.put('/updateLocations', (req, res) => { model.updateLocations(req, res)});
  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};


export class LocationController extends Model {
  model: Location;
  constructor(db: DB) {
    super(db, 'locations');
    this.model = new Location(db);
  }

  getGeocodeList(req: Request, res: Response) {
    const addr = req.params.address;

    this.model.getGeocodes(addr).then(rs => {
      // res.send(rs);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: rs 
      }));
    });
  }
  getPlaceList(req: Request, res: Response) {
    const keyword = req.params.input;
    this.model.getSuggestPlaces(keyword).then((rs: IGooglePlace[]) => {
      // res.send(rs);
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: rs 
      }));
    });
  }

}