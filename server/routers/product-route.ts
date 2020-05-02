import express, { Request, Response } from "express";
import { DB } from "../db";
import { Product } from "../models/product";
import { Model, Code } from "../models/model";

export function ProductRouter(db: DB){
  const router = express.Router();
  const model = new Product(db);
  const controller = new ProductController(db);
  
  // grocery api
  router.get('/G/:id', (req, res) => { controller.gv1_get(req, res); });
  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });

  // admin api /products/admin
  router.get('/admin', (req, res) => { controller.av1_list(req, res); });


  // old api
  router.get('/', (req, res) => { controller.list(req, res); });

  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  router.get('/clearImage', (req, res) => { model.clearImage(req, res); });
  router.get('/categorize', (req, res) => { model.categorize(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });
  router.post('/', (req, res) => { model.create(req, res); });
  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};

class ProductController extends Model{
  model: Product;

  constructor(db: DB) {
    super(db, 'products');
    this.model = new Product(db);
  }

  async list(req: Request, res: Response) {
    let query = {};
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    } else {
      query = req.body;
    }

    const ps = await this.model.list(query);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(ps, null, 3));
  }

  gv1_list(req: Request, res: Response) {
    const status = req.query.status;
    const merchantId = req.query.merchantId;
    const query = status ? {status} : {};
    res.setHeader('Content-Type', 'application/json');

    merchantId ? 
    this.model.joinFind({...query, merchantId}).then((products: any[]) => {
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: products 
      }));
    })
    :
    res.send(JSON.stringify({
      code: Code.FAIL,
      data: [] 
    }));
  }

  gv1_get(req: Request, res: Response) {
    const id = req.params.id;
    this.model.getById(id).then(product => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: product ? Code.SUCCESS : Code.FAIL,
        data: product 
      }));
    });
  }


  av1_list(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    this.model.joinFind({}).then((products: any[]) => {
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: products 
      }));
    });
  }
}