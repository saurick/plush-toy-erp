import BusinessAttachmentModalButton from '../business-list/BusinessAttachmentModalButton.jsx'
import {
  MaterialReferenceImageButton,
  MaterialReferenceImageRetry,
  useMaterialReferenceImage,
} from '../master-data/MaterialReferenceImage.jsx'
import './inventoryMaterialIdentity.css'

export default function InventoryMaterialIdentity({ materialID, name }) {
  const media = useMaterialReferenceImage(materialID, { lazy: true })
  return (
    <span className="erp-product-identity" ref={media.target}>
      {media.state === 'ready' ? (
        <MaterialReferenceImageButton materialID={materialID} attachmentID={media.id} name={name} thumbnail={media.source} access={media.access} />
      ) : media.state === 'failed' ? (
        <MaterialReferenceImageRetry name={name} onRetry={media.retry} />
      ) : null}
      <span className="erp-product-identity__text">
        <BusinessAttachmentModalButton
          ownerType="material"
          ownerId={materialID}
          buttonText={name}
          modalTitle={`${name} · 材料资料`}
          panelTitle="材料附件"
          description="材料档案中已保存的规格书、色卡和其他资料。"
          canUpload={false}
          buttonProps={{
            type: 'link',
            icon: null,
            className: 'erp-inventory-material-identity__link',
            onClick: (event) => event.stopPropagation(),
            onDoubleClick: (event) => event.stopPropagation(),
            onKeyDown: (event) => { if (event.key !== 'Escape') event.stopPropagation() },
          }}
        />
      </span>
    </span>
  )
}
