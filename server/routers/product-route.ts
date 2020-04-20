import express, { Request, Response } from "express";
import { DB } from "../db";
import { Product } from "../models/product";
import { Model } from "../models/model";

export function ProductRouter(db: DB){
  const router = express.Router();
  const model = new Product(db);
  const controller = new ProductController(db);
  
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

  list(req: Request, res: Response) {
    let query = {};
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    this.model.list(query).then((ps: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(ps, null, 3));
    });
  }
}