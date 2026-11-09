import React from 'react'
import Select from '@/common/components/select/AppSelect'
import './productIdentity.css'

const ProductFieldControl = React.forwardRef(({ as: Control = Select, thumbnail, ...props }, ref) => (
  <div className="erp-product-field-control">
    {thumbnail}
    <div className="erp-product-field-control__input">
      <Control {...props} ref={ref} />
    </div>
  </div>
))
ProductFieldControl.displayName = 'ProductFieldControl'

export default ProductFieldControl
