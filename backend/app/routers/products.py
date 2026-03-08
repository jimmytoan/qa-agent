from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ProductModel
from ..schemas import Product, ProductCreate, ProductUpdate

router = APIRouter(prefix='/api/products', tags=['products'])


@router.get('', response_model=list[Product])
def list_products(db: Session = Depends(get_db)) -> list[ProductModel]:
    return list(db.scalars(select(ProductModel).order_by(ProductModel.created_at.desc())).all())


@router.post('', response_model=Product)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> ProductModel:
    product = ProductModel(org_id=1, name=payload.name, slug=payload.slug, description=payload.description)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get('/{product_id}', response_model=Product)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductModel:
    product = db.get(ProductModel, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail='Product not found')
    return product


@router.patch('/{product_id}', response_model=Product)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)) -> ProductModel:
    product = db.get(ProductModel, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail='Product not found')

    if payload.name is not None:
        product.name = payload.name
    if payload.slug is not None:
        product.slug = payload.slug
    if payload.description is not None:
        product.description = payload.description

    db.commit()
    db.refresh(product)
    return product


@router.delete('/{product_id}')
def delete_product(product_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    product = db.get(ProductModel, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail='Product not found')
    db.delete(product)
    db.commit()
    return {'deleted': True}
