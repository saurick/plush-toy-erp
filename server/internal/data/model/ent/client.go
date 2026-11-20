	builders := make([]*ProductionOrderEventCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionOrderEventCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionOrderEvent.
func (c *ProductionOrderEventClient) Update() *ProductionOrderEventUpdate {
	mutation := newProductionOrderEventMutation(c.config, OpUpdate)
	return &ProductionOrderEventUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionOrderEventClient) UpdateOne(_m *ProductionOrderEvent) *ProductionOrderEventUpdateOne {
	mutation := newProductionOrderEventMutation(c.config, OpUpdateOne, withProductionOrderEvent(_m))
	return &ProductionOrderEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionOrderEventClient) UpdateOneID(id int) *ProductionOrderEventUpdateOne {
	mutation := newProductionOrderEventMutation(c.config, OpUpdateOne, withProductionOrderEventID(id))
	return &ProductionOrderEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionOrderEvent.
func (c *ProductionOrderEventClient) Delete() *ProductionOrderEventDelete {
	mutation := newProductionOrderEventMutation(c.config, OpDelete)
	return &ProductionOrderEventDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionOrderEventClient) DeleteOne(_m *ProductionOrderEvent) *ProductionOrderEventDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionOrderEventClient) DeleteOneID(id int) *ProductionOrderEventDeleteOne {
	builder := c.Delete().Where(productionorderevent.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionOrderEventDeleteOne{builder}
}

// Query returns a query builder for ProductionOrderEvent.
func (c *ProductionOrderEventClient) Query() *ProductionOrderEventQuery {
	return &ProductionOrderEventQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionOrderEvent},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionOrderEvent entity by its id.
func (c *ProductionOrderEventClient) Get(ctx context.Context, id int) (*ProductionOrderEvent, error) {
	return c.Query().Where(productionorderevent.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionOrderEventClient) GetX(ctx context.Context, id int) *ProductionOrderEvent {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionOrder queries the production_order edge of a ProductionOrderEvent.
func (c *ProductionOrderEventClient) QueryProductionOrder(_m *ProductionOrderEvent) *ProductionOrderQuery {
	query := (&ProductionOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderevent.Table, productionorderevent.FieldID, id),
			sqlgraph.To(productionorder.Table, productionorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionorderevent.ProductionOrderTable, productionorderevent.ProductionOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryActor queries the actor edge of a ProductionOrderEvent.
func (c *ProductionOrderEventClient) QueryActor(_m *ProductionOrderEvent) *AdminUserQuery {
	query := (&AdminUserClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderevent.Table, productionorderevent.FieldID, id),
			sqlgraph.To(adminuser.Table, adminuser.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderevent.ActorTable, productionorderevent.ActorColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionOrderEventClient) Hooks() []Hook {
	hooks := c.hooks.ProductionOrderEvent
	return append(hooks[:len(hooks):len(hooks)], productionorderevent.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionOrderEventClient) Interceptors() []Interceptor {
	return c.inters.ProductionOrderEvent
}

func (c *ProductionOrderEventClient) mutate(ctx context.Context, m *ProductionOrderEventMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionOrderEventCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionOrderEventUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionOrderEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionOrderEventDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionOrderEvent mutation op: %q", m.Op())
	}
}

// ProductionOrderItemClient is a client for the ProductionOrderItem schema.
type ProductionOrderItemClient struct {
	config
}

// NewProductionOrderItemClient returns a client for the ProductionOrderItem from the given config.
func NewProductionOrderItemClient(c config) *ProductionOrderItemClient {
	return &ProductionOrderItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionorderitem.Hooks(f(g(h())))`.
func (c *ProductionOrderItemClient) Use(hooks ...Hook) {
	c.hooks.ProductionOrderItem = append(c.hooks.ProductionOrderItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionorderitem.Intercept(f(g(h())))`.
func (c *ProductionOrderItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionOrderItem = append(c.inters.ProductionOrderItem, interceptors...)
}

// Create returns a builder for creating a ProductionOrderItem entity.
func (c *ProductionOrderItemClient) Create() *ProductionOrderItemCreate {
	mutation := newProductionOrderItemMutation(c.config, OpCreate)
	return &ProductionOrderItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionOrderItem entities.
func (c *ProductionOrderItemClient) CreateBulk(builders ...*ProductionOrderItemCreate) *ProductionOrderItemCreateBulk {
	return &ProductionOrderItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionOrderItemClient) MapCreateBulk(slice any, setFunc func(*ProductionOrderItemCreate, int)) *ProductionOrderItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionOrderItemCreateBulk{err: fmt.Errorf("calling to ProductionOrderItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionOrderItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionOrderItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionOrderItem.
func (c *ProductionOrderItemClient) Update() *ProductionOrderItemUpdate {
	mutation := newProductionOrderItemMutation(c.config, OpUpdate)
	return &ProductionOrderItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionOrderItemClient) UpdateOne(_m *ProductionOrderItem) *ProductionOrderItemUpdateOne {
	mutation := newProductionOrderItemMutation(c.config, OpUpdateOne, withProductionOrderItem(_m))
	return &ProductionOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionOrderItemClient) UpdateOneID(id int) *ProductionOrderItemUpdateOne {
	mutation := newProductionOrderItemMutation(c.config, OpUpdateOne, withProductionOrderItemID(id))
	return &ProductionOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionOrderItem.
func (c *ProductionOrderItemClient) Delete() *ProductionOrderItemDelete {
	mutation := newProductionOrderItemMutation(c.config, OpDelete)
	return &ProductionOrderItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionOrderItemClient) DeleteOne(_m *ProductionOrderItem) *ProductionOrderItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionOrderItemClient) DeleteOneID(id int) *ProductionOrderItemDeleteOne {
	builder := c.Delete().Where(productionorderitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionOrderItemDeleteOne{builder}
}

// Query returns a query builder for ProductionOrderItem.
func (c *ProductionOrderItemClient) Query() *ProductionOrderItemQuery {
	return &ProductionOrderItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionOrderItem},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionOrderItem entity by its id.
func (c *ProductionOrderItemClient) Get(ctx context.Context, id int) (*ProductionOrderItem, error) {
	return c.Query().Where(productionorderitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionOrderItemClient) GetX(ctx context.Context, id int) *ProductionOrderItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionOrder queries the production_order edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryProductionOrder(_m *ProductionOrderItem) *ProductionOrderQuery {
	query := (&ProductionOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(productionorder.Table, productionorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionorderitem.ProductionOrderTable, productionorderitem.ProductionOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterialRequirements queries the material_requirements edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryMaterialRequirements(_m *ProductionOrderItem) *ProductionOrderMaterialRequirementQuery {
	query := (&ProductionOrderMaterialRequirementClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionorderitem.MaterialRequirementsTable, productionorderitem.MaterialRequirementsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOperations queries the operations edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryOperations(_m *ProductionOrderItem) *ProductionOrderOperationQuery {
	query := (&ProductionOrderOperationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(productionorderoperation.Table, productionorderoperation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionorderitem.OperationsTable, productionorderitem.OperationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWipBatches queries the wip_batches edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryWipBatches(_m *ProductionOrderItem) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionorderitem.WipBatchesTable, productionorderitem.WipBatchesColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPackagingConfirmation queries the packaging_confirmation edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryPackagingConfirmation(_m *ProductionOrderItem) *ProductionPackagingConfirmationQuery {
	query := (&ProductionPackagingConfirmationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(productionpackagingconfirmation.Table, productionpackagingconfirmation.FieldID),
			sqlgraph.Edge(sqlgraph.O2O, false, productionorderitem.PackagingConfirmationTable, productionorderitem.PackagingConfirmationColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProduct queries the product edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryProduct(_m *ProductionOrderItem) *ProductQuery {
	query := (&ProductClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(product.Table, product.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderitem.ProductTable, productionorderitem.ProductColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductSku queries the product_sku edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryProductSku(_m *ProductionOrderItem) *ProductSKUQuery {
	query := (&ProductSKUClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(productsku.Table, productsku.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderitem.ProductSkuTable, productionorderitem.ProductSkuColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryUnit(_m *ProductionOrderItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderitem.UnitTable, productionorderitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QuerySalesOrderItem queries the sales_order_item edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QuerySalesOrderItem(_m *ProductionOrderItem) *SalesOrderItemQuery {
	query := (&SalesOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(salesorderitem.Table, salesorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderitem.SalesOrderItemTable, productionorderitem.SalesOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryBomHeader queries the bom_header edge of a ProductionOrderItem.
func (c *ProductionOrderItemClient) QueryBomHeader(_m *ProductionOrderItem) *BOMHeaderQuery {
	query := (&BOMHeaderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderitem.Table, productionorderitem.FieldID, id),
			sqlgraph.To(bomheader.Table, bomheader.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderitem.BomHeaderTable, productionorderitem.BomHeaderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionOrderItemClient) Hooks() []Hook {
	return c.hooks.ProductionOrderItem
}

// Interceptors returns the client interceptors.
func (c *ProductionOrderItemClient) Interceptors() []Interceptor {
	return c.inters.ProductionOrderItem
}

func (c *ProductionOrderItemClient) mutate(ctx context.Context, m *ProductionOrderItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionOrderItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionOrderItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionOrderItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionOrderItem mutation op: %q", m.Op())
	}
}

// ProductionOrderMaterialRequirementClient is a client for the ProductionOrderMaterialRequirement schema.
type ProductionOrderMaterialRequirementClient struct {
	config
}

// NewProductionOrderMaterialRequirementClient returns a client for the ProductionOrderMaterialRequirement from the given config.
func NewProductionOrderMaterialRequirementClient(c config) *ProductionOrderMaterialRequirementClient {
	return &ProductionOrderMaterialRequirementClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionordermaterialrequirement.Hooks(f(g(h())))`.
func (c *ProductionOrderMaterialRequirementClient) Use(hooks ...Hook) {
	c.hooks.ProductionOrderMaterialRequirement = append(c.hooks.ProductionOrderMaterialRequirement, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionordermaterialrequirement.Intercept(f(g(h())))`.
func (c *ProductionOrderMaterialRequirementClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionOrderMaterialRequirement = append(c.inters.ProductionOrderMaterialRequirement, interceptors...)
}

// Create returns a builder for creating a ProductionOrderMaterialRequirement entity.
func (c *ProductionOrderMaterialRequirementClient) Create() *ProductionOrderMaterialRequirementCreate {
	mutation := newProductionOrderMaterialRequirementMutation(c.config, OpCreate)
	return &ProductionOrderMaterialRequirementCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionOrderMaterialRequirement entities.
func (c *ProductionOrderMaterialRequirementClient) CreateBulk(builders ...*ProductionOrderMaterialRequirementCreate) *ProductionOrderMaterialRequirementCreateBulk {
	return &ProductionOrderMaterialRequirementCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionOrderMaterialRequirementClient) MapCreateBulk(slice any, setFunc func(*ProductionOrderMaterialRequirementCreate, int)) *ProductionOrderMaterialRequirementCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionOrderMaterialRequirementCreateBulk{err: fmt.Errorf("calling to ProductionOrderMaterialRequirementClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionOrderMaterialRequirementCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionOrderMaterialRequirementCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) Update() *ProductionOrderMaterialRequirementUpdate {
	mutation := newProductionOrderMaterialRequirementMutation(c.config, OpUpdate)
	return &ProductionOrderMaterialRequirementUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionOrderMaterialRequirementClient) UpdateOne(_m *ProductionOrderMaterialRequirement) *ProductionOrderMaterialRequirementUpdateOne {
	mutation := newProductionOrderMaterialRequirementMutation(c.config, OpUpdateOne, withProductionOrderMaterialRequirement(_m))
	return &ProductionOrderMaterialRequirementUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionOrderMaterialRequirementClient) UpdateOneID(id int) *ProductionOrderMaterialRequirementUpdateOne {
	mutation := newProductionOrderMaterialRequirementMutation(c.config, OpUpdateOne, withProductionOrderMaterialRequirementID(id))
	return &ProductionOrderMaterialRequirementUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) Delete() *ProductionOrderMaterialRequirementDelete {
	mutation := newProductionOrderMaterialRequirementMutation(c.config, OpDelete)
	return &ProductionOrderMaterialRequirementDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionOrderMaterialRequirementClient) DeleteOne(_m *ProductionOrderMaterialRequirement) *ProductionOrderMaterialRequirementDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionOrderMaterialRequirementClient) DeleteOneID(id int) *ProductionOrderMaterialRequirementDeleteOne {
	builder := c.Delete().Where(productionordermaterialrequirement.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionOrderMaterialRequirementDeleteOne{builder}
}

// Query returns a query builder for ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) Query() *ProductionOrderMaterialRequirementQuery {
	return &ProductionOrderMaterialRequirementQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionOrderMaterialRequirement},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionOrderMaterialRequirement entity by its id.
func (c *ProductionOrderMaterialRequirementClient) Get(ctx context.Context, id int) (*ProductionOrderMaterialRequirement, error) {
	return c.Query().Where(productionordermaterialrequirement.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionOrderMaterialRequirementClient) GetX(ctx context.Context, id int) *ProductionOrderMaterialRequirement {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionOrder queries the production_order edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryProductionOrder(_m *ProductionOrderMaterialRequirement) *ProductionOrderQuery {
	query := (&ProductionOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(productionorder.Table, productionorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionordermaterialrequirement.ProductionOrderTable, productionordermaterialrequirement.ProductionOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderItem queries the production_order_item edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryProductionOrderItem(_m *ProductionOrderMaterialRequirement) *ProductionOrderItemQuery {
	query := (&ProductionOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(productionorderitem.Table, productionorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionordermaterialrequirement.ProductionOrderItemTable, productionordermaterialrequirement.ProductionOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryBomHeader queries the bom_header edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryBomHeader(_m *ProductionOrderMaterialRequirement) *BOMHeaderQuery {
	query := (&BOMHeaderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(bomheader.Table, bomheader.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionordermaterialrequirement.BomHeaderTable, productionordermaterialrequirement.BomHeaderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryBomItem queries the bom_item edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryBomItem(_m *ProductionOrderMaterialRequirement) *BOMItemQuery {
	query := (&BOMItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(bomitem.Table, bomitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionordermaterialrequirement.BomItemTable, productionordermaterialrequirement.BomItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterial queries the material edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryMaterial(_m *ProductionOrderMaterialRequirement) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionordermaterialrequirement.MaterialTable, productionordermaterialrequirement.MaterialColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryUnit(_m *ProductionOrderMaterialRequirement) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionordermaterialrequirement.UnitTable, productionordermaterialrequirement.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionWipOutsourcingAllocations queries the production_wip_outsourcing_allocations edge of a ProductionOrderMaterialRequirement.
func (c *ProductionOrderMaterialRequirementClient) QueryProductionWipOutsourcingAllocations(_m *ProductionOrderMaterialRequirement) *ProductionWIPOutsourcingAllocationQuery {
	query := (&ProductionWIPOutsourcingAllocationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID, id),
			sqlgraph.To(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionordermaterialrequirement.ProductionWipOutsourcingAllocationsTable, productionordermaterialrequirement.ProductionWipOutsourcingAllocationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionOrderMaterialRequirementClient) Hooks() []Hook {
	hooks := c.hooks.ProductionOrderMaterialRequirement
	return append(hooks[:len(hooks):len(hooks)], productionordermaterialrequirement.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionOrderMaterialRequirementClient) Interceptors() []Interceptor {
	return c.inters.ProductionOrderMaterialRequirement
}

func (c *ProductionOrderMaterialRequirementClient) mutate(ctx context.Context, m *ProductionOrderMaterialRequirementMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionOrderMaterialRequirementCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionOrderMaterialRequirementUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionOrderMaterialRequirementUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionOrderMaterialRequirementDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionOrderMaterialRequirement mutation op: %q", m.Op())
	}
}

// ProductionOrderOperationClient is a client for the ProductionOrderOperation schema.
type ProductionOrderOperationClient struct {
	config
}

// NewProductionOrderOperationClient returns a client for the ProductionOrderOperation from the given config.
func NewProductionOrderOperationClient(c config) *ProductionOrderOperationClient {
	return &ProductionOrderOperationClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionorderoperation.Hooks(f(g(h())))`.
func (c *ProductionOrderOperationClient) Use(hooks ...Hook) {
	c.hooks.ProductionOrderOperation = append(c.hooks.ProductionOrderOperation, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionorderoperation.Intercept(f(g(h())))`.
func (c *ProductionOrderOperationClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionOrderOperation = append(c.inters.ProductionOrderOperation, interceptors...)
}

// Create returns a builder for creating a ProductionOrderOperation entity.
func (c *ProductionOrderOperationClient) Create() *ProductionOrderOperationCreate {
	mutation := newProductionOrderOperationMutation(c.config, OpCreate)
	return &ProductionOrderOperationCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionOrderOperation entities.
func (c *ProductionOrderOperationClient) CreateBulk(builders ...*ProductionOrderOperationCreate) *ProductionOrderOperationCreateBulk {
	return &ProductionOrderOperationCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionOrderOperationClient) MapCreateBulk(slice any, setFunc func(*ProductionOrderOperationCreate, int)) *ProductionOrderOperationCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionOrderOperationCreateBulk{err: fmt.Errorf("calling to ProductionOrderOperationClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionOrderOperationCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionOrderOperationCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionOrderOperation.
func (c *ProductionOrderOperationClient) Update() *ProductionOrderOperationUpdate {
	mutation := newProductionOrderOperationMutation(c.config, OpUpdate)
	return &ProductionOrderOperationUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionOrderOperationClient) UpdateOne(_m *ProductionOrderOperation) *ProductionOrderOperationUpdateOne {
	mutation := newProductionOrderOperationMutation(c.config, OpUpdateOne, withProductionOrderOperation(_m))
	return &ProductionOrderOperationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionOrderOperationClient) UpdateOneID(id int) *ProductionOrderOperationUpdateOne {
	mutation := newProductionOrderOperationMutation(c.config, OpUpdateOne, withProductionOrderOperationID(id))
	return &ProductionOrderOperationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionOrderOperation.
func (c *ProductionOrderOperationClient) Delete() *ProductionOrderOperationDelete {
	mutation := newProductionOrderOperationMutation(c.config, OpDelete)
	return &ProductionOrderOperationDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionOrderOperationClient) DeleteOne(_m *ProductionOrderOperation) *ProductionOrderOperationDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionOrderOperationClient) DeleteOneID(id int) *ProductionOrderOperationDeleteOne {
	builder := c.Delete().Where(productionorderoperation.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionOrderOperationDeleteOne{builder}
}

// Query returns a query builder for ProductionOrderOperation.
func (c *ProductionOrderOperationClient) Query() *ProductionOrderOperationQuery {
	return &ProductionOrderOperationQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionOrderOperation},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionOrderOperation entity by its id.
func (c *ProductionOrderOperationClient) Get(ctx context.Context, id int) (*ProductionOrderOperation, error) {
	return c.Query().Where(productionorderoperation.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionOrderOperationClient) GetX(ctx context.Context, id int) *ProductionOrderOperation {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionOrder queries the production_order edge of a ProductionOrderOperation.
func (c *ProductionOrderOperationClient) QueryProductionOrder(_m *ProductionOrderOperation) *ProductionOrderQuery {
	query := (&ProductionOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderoperation.Table, productionorderoperation.FieldID, id),
			sqlgraph.To(productionorder.Table, productionorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionorderoperation.ProductionOrderTable, productionorderoperation.ProductionOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderItem queries the production_order_item edge of a ProductionOrderOperation.
func (c *ProductionOrderOperationClient) QueryProductionOrderItem(_m *ProductionOrderOperation) *ProductionOrderItemQuery {
	query := (&ProductionOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderoperation.Table, productionorderoperation.FieldID, id),
			sqlgraph.To(productionorderitem.Table, productionorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionorderoperation.ProductionOrderItemTable, productionorderoperation.ProductionOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProcess queries the process edge of a ProductionOrderOperation.
func (c *ProductionOrderOperationClient) QueryProcess(_m *ProductionOrderOperation) *ProcessQuery {
	query := (&ProcessClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderoperation.Table, productionorderoperation.FieldID, id),
			sqlgraph.To(process.Table, process.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionorderoperation.ProcessTable, productionorderoperation.ProcessColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWipBatches queries the wip_batches edge of a ProductionOrderOperation.
func (c *ProductionOrderOperationClient) QueryWipBatches(_m *ProductionOrderOperation) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionorderoperation.Table, productionorderoperation.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionorderoperation.WipBatchesTable, productionorderoperation.WipBatchesColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionOrderOperationClient) Hooks() []Hook {
	hooks := c.hooks.ProductionOrderOperation
	return append(hooks[:len(hooks):len(hooks)], productionorderoperation.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionOrderOperationClient) Interceptors() []Interceptor {
	return c.inters.ProductionOrderOperation
}

func (c *ProductionOrderOperationClient) mutate(ctx context.Context, m *ProductionOrderOperationMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionOrderOperationCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionOrderOperationUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionOrderOperationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionOrderOperationDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionOrderOperation mutation op: %q", m.Op())
	}
}

// ProductionPackagingConfirmationClient is a client for the ProductionPackagingConfirmation schema.
type ProductionPackagingConfirmationClient struct {
	config
}

// NewProductionPackagingConfirmationClient returns a client for the ProductionPackagingConfirmation from the given config.
func NewProductionPackagingConfirmationClient(c config) *ProductionPackagingConfirmationClient {
	return &ProductionPackagingConfirmationClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionpackagingconfirmation.Hooks(f(g(h())))`.
func (c *ProductionPackagingConfirmationClient) Use(hooks ...Hook) {
	c.hooks.ProductionPackagingConfirmation = append(c.hooks.ProductionPackagingConfirmation, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionpackagingconfirmation.Intercept(f(g(h())))`.
func (c *ProductionPackagingConfirmationClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionPackagingConfirmation = append(c.inters.ProductionPackagingConfirmation, interceptors...)
}

// Create returns a builder for creating a ProductionPackagingConfirmation entity.
func (c *ProductionPackagingConfirmationClient) Create() *ProductionPackagingConfirmationCreate {
	mutation := newProductionPackagingConfirmationMutation(c.config, OpCreate)
	return &ProductionPackagingConfirmationCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionPackagingConfirmation entities.
func (c *ProductionPackagingConfirmationClient) CreateBulk(builders ...*ProductionPackagingConfirmationCreate) *ProductionPackagingConfirmationCreateBulk {
	return &ProductionPackagingConfirmationCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionPackagingConfirmationClient) MapCreateBulk(slice any, setFunc func(*ProductionPackagingConfirmationCreate, int)) *ProductionPackagingConfirmationCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionPackagingConfirmationCreateBulk{err: fmt.Errorf("calling to ProductionPackagingConfirmationClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionPackagingConfirmationCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionPackagingConfirmationCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionPackagingConfirmation.
func (c *ProductionPackagingConfirmationClient) Update() *ProductionPackagingConfirmationUpdate {
	mutation := newProductionPackagingConfirmationMutation(c.config, OpUpdate)
	return &ProductionPackagingConfirmationUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionPackagingConfirmationClient) UpdateOne(_m *ProductionPackagingConfirmation) *ProductionPackagingConfirmationUpdateOne {
	mutation := newProductionPackagingConfirmationMutation(c.config, OpUpdateOne, withProductionPackagingConfirmation(_m))
	return &ProductionPackagingConfirmationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionPackagingConfirmationClient) UpdateOneID(id int) *ProductionPackagingConfirmationUpdateOne {
	mutation := newProductionPackagingConfirmationMutation(c.config, OpUpdateOne, withProductionPackagingConfirmationID(id))
	return &ProductionPackagingConfirmationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionPackagingConfirmation.
func (c *ProductionPackagingConfirmationClient) Delete() *ProductionPackagingConfirmationDelete {
	mutation := newProductionPackagingConfirmationMutation(c.config, OpDelete)
	return &ProductionPackagingConfirmationDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionPackagingConfirmationClient) DeleteOne(_m *ProductionPackagingConfirmation) *ProductionPackagingConfirmationDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionPackagingConfirmationClient) DeleteOneID(id int) *ProductionPackagingConfirmationDeleteOne {
	builder := c.Delete().Where(productionpackagingconfirmation.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionPackagingConfirmationDeleteOne{builder}
}

// Query returns a query builder for ProductionPackagingConfirmation.
func (c *ProductionPackagingConfirmationClient) Query() *ProductionPackagingConfirmationQuery {
	return &ProductionPackagingConfirmationQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionPackagingConfirmation},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionPackagingConfirmation entity by its id.
func (c *ProductionPackagingConfirmationClient) Get(ctx context.Context, id int) (*ProductionPackagingConfirmation, error) {
	return c.Query().Where(productionpackagingconfirmation.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionPackagingConfirmationClient) GetX(ctx context.Context, id int) *ProductionPackagingConfirmation {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionOrder queries the production_order edge of a ProductionPackagingConfirmation.
func (c *ProductionPackagingConfirmationClient) QueryProductionOrder(_m *ProductionPackagingConfirmation) *ProductionOrderQuery {
	query := (&ProductionOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionpackagingconfirmation.Table, productionpackagingconfirmation.FieldID, id),
			sqlgraph.To(productionorder.Table, productionorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionpackagingconfirmation.ProductionOrderTable, productionpackagingconfirmation.ProductionOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderItem queries the production_order_item edge of a ProductionPackagingConfirmation.
func (c *ProductionPackagingConfirmationClient) QueryProductionOrderItem(_m *ProductionPackagingConfirmation) *ProductionOrderItemQuery {
	query := (&ProductionOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionpackagingconfirmation.Table, productionpackagingconfirmation.FieldID, id),
			sqlgraph.To(productionorderitem.Table, productionorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2O, true, productionpackagingconfirmation.ProductionOrderItemTable, productionpackagingconfirmation.ProductionOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryConfirmer queries the confirmer edge of a ProductionPackagingConfirmation.
func (c *ProductionPackagingConfirmationClient) QueryConfirmer(_m *ProductionPackagingConfirmation) *AdminUserQuery {
	query := (&AdminUserClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionpackagingconfirmation.Table, productionpackagingconfirmation.FieldID, id),
			sqlgraph.To(adminuser.Table, adminuser.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionpackagingconfirmation.ConfirmerTable, productionpackagingconfirmation.ConfirmerColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionPackagingConfirmationClient) Hooks() []Hook {
	hooks := c.hooks.ProductionPackagingConfirmation
	return append(hooks[:len(hooks):len(hooks)], productionpackagingconfirmation.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionPackagingConfirmationClient) Interceptors() []Interceptor {
	return c.inters.ProductionPackagingConfirmation
}

func (c *ProductionPackagingConfirmationClient) mutate(ctx context.Context, m *ProductionPackagingConfirmationMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionPackagingConfirmationCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionPackagingConfirmationUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionPackagingConfirmationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionPackagingConfirmationDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionPackagingConfirmation mutation op: %q", m.Op())
	}
}

// ProductionWIPBatchClient is a client for the ProductionWIPBatch schema.
type ProductionWIPBatchClient struct {
	config
}

// NewProductionWIPBatchClient returns a client for the ProductionWIPBatch from the given config.
func NewProductionWIPBatchClient(c config) *ProductionWIPBatchClient {
	return &ProductionWIPBatchClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionwipbatch.Hooks(f(g(h())))`.
func (c *ProductionWIPBatchClient) Use(hooks ...Hook) {
	c.hooks.ProductionWIPBatch = append(c.hooks.ProductionWIPBatch, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionwipbatch.Intercept(f(g(h())))`.
func (c *ProductionWIPBatchClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionWIPBatch = append(c.inters.ProductionWIPBatch, interceptors...)
}

// Create returns a builder for creating a ProductionWIPBatch entity.
func (c *ProductionWIPBatchClient) Create() *ProductionWIPBatchCreate {
	mutation := newProductionWIPBatchMutation(c.config, OpCreate)
	return &ProductionWIPBatchCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionWIPBatch entities.
func (c *ProductionWIPBatchClient) CreateBulk(builders ...*ProductionWIPBatchCreate) *ProductionWIPBatchCreateBulk {
	return &ProductionWIPBatchCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionWIPBatchClient) MapCreateBulk(slice any, setFunc func(*ProductionWIPBatchCreate, int)) *ProductionWIPBatchCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionWIPBatchCreateBulk{err: fmt.Errorf("calling to ProductionWIPBatchClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionWIPBatchCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionWIPBatchCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionWIPBatch.
func (c *ProductionWIPBatchClient) Update() *ProductionWIPBatchUpdate {
	mutation := newProductionWIPBatchMutation(c.config, OpUpdate)
	return &ProductionWIPBatchUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionWIPBatchClient) UpdateOne(_m *ProductionWIPBatch) *ProductionWIPBatchUpdateOne {
	mutation := newProductionWIPBatchMutation(c.config, OpUpdateOne, withProductionWIPBatch(_m))
	return &ProductionWIPBatchUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionWIPBatchClient) UpdateOneID(id int) *ProductionWIPBatchUpdateOne {
	mutation := newProductionWIPBatchMutation(c.config, OpUpdateOne, withProductionWIPBatchID(id))
	return &ProductionWIPBatchUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionWIPBatch.
func (c *ProductionWIPBatchClient) Delete() *ProductionWIPBatchDelete {
	mutation := newProductionWIPBatchMutation(c.config, OpDelete)
	return &ProductionWIPBatchDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionWIPBatchClient) DeleteOne(_m *ProductionWIPBatch) *ProductionWIPBatchDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionWIPBatchClient) DeleteOneID(id int) *ProductionWIPBatchDeleteOne {
	builder := c.Delete().Where(productionwipbatch.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionWIPBatchDeleteOne{builder}
}

// Query returns a query builder for ProductionWIPBatch.
func (c *ProductionWIPBatchClient) Query() *ProductionWIPBatchQuery {
	return &ProductionWIPBatchQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionWIPBatch},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionWIPBatch entity by its id.
func (c *ProductionWIPBatchClient) Get(ctx context.Context, id int) (*ProductionWIPBatch, error) {
	return c.Query().Where(productionwipbatch.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionWIPBatchClient) GetX(ctx context.Context, id int) *ProductionWIPBatch {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionOrder queries the production_order edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryProductionOrder(_m *ProductionWIPBatch) *ProductionOrderQuery {
	query := (&ProductionOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionorder.Table, productionorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.ProductionOrderTable, productionwipbatch.ProductionOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderItem queries the production_order_item edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryProductionOrderItem(_m *ProductionWIPBatch) *ProductionOrderItemQuery {
	query := (&ProductionOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionorderitem.Table, productionorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.ProductionOrderItemTable, productionwipbatch.ProductionOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderOperation queries the production_order_operation edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryProductionOrderOperation(_m *ProductionWIPBatch) *ProductionOrderOperationQuery {
	query := (&ProductionOrderOperationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionorderoperation.Table, productionorderoperation.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.ProductionOrderOperationTable, productionwipbatch.ProductionOrderOperationColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryChildBatches queries the child_batches edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryChildBatches(_m *ProductionWIPBatch) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionwipbatch.ChildBatchesTable, productionwipbatch.ChildBatchesColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QuerySourceBatch queries the source_batch edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QuerySourceBatch(_m *ProductionWIPBatch) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.SourceBatchTable, productionwipbatch.SourceBatchColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOriginReworkFact queries the origin_rework_fact edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryOriginReworkFact(_m *ProductionWIPBatch) *ProductionFactQuery {
	query := (&ProductionFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionfact.Table, productionfact.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.OriginReworkFactTable, productionwipbatch.OriginReworkFactColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryCompletionFacts queries the completion_facts edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryCompletionFacts(_m *ProductionWIPBatch) *ProductionFactQuery {
	query := (&ProductionFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionfact.Table, productionfact.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionwipbatch.CompletionFactsTable, productionwipbatch.CompletionFactsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOriginExceptionDecision queries the origin_exception_decision edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryOriginExceptionDecision(_m *ProductionWIPBatch) *ProductionExceptionDecisionQuery {
	query := (&ProductionExceptionDecisionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionexceptiondecision.Table, productionexceptiondecision.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.OriginExceptionDecisionTable, productionwipbatch.OriginExceptionDecisionColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryFinishedGoodsReceipt queries the finished_goods_receipt edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryFinishedGoodsReceipt(_m *ProductionWIPBatch) *ProductionFactQuery {
	query := (&ProductionFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionfact.Table, productionfact.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipbatch.FinishedGoodsReceiptTable, productionwipbatch.FinishedGoodsReceiptColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryEvents queries the events edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryEvents(_m *ProductionWIPBatch) *ProductionWIPEventQuery {
	query := (&ProductionWIPEventClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionwipevent.Table, productionwipevent.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionwipbatch.EventsTable, productionwipbatch.EventsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryQualityInspections queries the quality_inspections edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryQualityInspections(_m *ProductionWIPBatch) *QualityInspectionQuery {
	query := (&QualityInspectionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(qualityinspection.Table, qualityinspection.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionwipbatch.QualityInspectionsTable, productionwipbatch.QualityInspectionsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOutsourcingAllocations queries the outsourcing_allocations edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryOutsourcingAllocations(_m *ProductionWIPBatch) *ProductionWIPOutsourcingAllocationQuery {
	query := (&ProductionWIPOutsourcingAllocationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, productionwipbatch.OutsourcingAllocationsTable, productionwipbatch.OutsourcingAllocationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryCreator queries the creator edge of a ProductionWIPBatch.
func (c *ProductionWIPBatchClient) QueryCreator(_m *ProductionWIPBatch) *AdminUserQuery {
	query := (&AdminUserClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipbatch.Table, productionwipbatch.FieldID, id),
			sqlgraph.To(adminuser.Table, adminuser.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionwipbatch.CreatorTable, productionwipbatch.CreatorColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionWIPBatchClient) Hooks() []Hook {
	hooks := c.hooks.ProductionWIPBatch
	return append(hooks[:len(hooks):len(hooks)], productionwipbatch.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionWIPBatchClient) Interceptors() []Interceptor {
	return c.inters.ProductionWIPBatch
}

func (c *ProductionWIPBatchClient) mutate(ctx context.Context, m *ProductionWIPBatchMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionWIPBatchCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionWIPBatchUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionWIPBatchUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionWIPBatchDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionWIPBatch mutation op: %q", m.Op())
	}
}

// ProductionWIPEventClient is a client for the ProductionWIPEvent schema.
type ProductionWIPEventClient struct {
	config
}

// NewProductionWIPEventClient returns a client for the ProductionWIPEvent from the given config.
func NewProductionWIPEventClient(c config) *ProductionWIPEventClient {
	return &ProductionWIPEventClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionwipevent.Hooks(f(g(h())))`.
func (c *ProductionWIPEventClient) Use(hooks ...Hook) {
	c.hooks.ProductionWIPEvent = append(c.hooks.ProductionWIPEvent, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionwipevent.Intercept(f(g(h())))`.
func (c *ProductionWIPEventClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionWIPEvent = append(c.inters.ProductionWIPEvent, interceptors...)
}

// Create returns a builder for creating a ProductionWIPEvent entity.
func (c *ProductionWIPEventClient) Create() *ProductionWIPEventCreate {
	mutation := newProductionWIPEventMutation(c.config, OpCreate)
	return &ProductionWIPEventCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionWIPEvent entities.
func (c *ProductionWIPEventClient) CreateBulk(builders ...*ProductionWIPEventCreate) *ProductionWIPEventCreateBulk {
	return &ProductionWIPEventCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionWIPEventClient) MapCreateBulk(slice any, setFunc func(*ProductionWIPEventCreate, int)) *ProductionWIPEventCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionWIPEventCreateBulk{err: fmt.Errorf("calling to ProductionWIPEventClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionWIPEventCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionWIPEventCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionWIPEvent.
func (c *ProductionWIPEventClient) Update() *ProductionWIPEventUpdate {
	mutation := newProductionWIPEventMutation(c.config, OpUpdate)
	return &ProductionWIPEventUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionWIPEventClient) UpdateOne(_m *ProductionWIPEvent) *ProductionWIPEventUpdateOne {
	mutation := newProductionWIPEventMutation(c.config, OpUpdateOne, withProductionWIPEvent(_m))
	return &ProductionWIPEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionWIPEventClient) UpdateOneID(id int) *ProductionWIPEventUpdateOne {
	mutation := newProductionWIPEventMutation(c.config, OpUpdateOne, withProductionWIPEventID(id))
	return &ProductionWIPEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionWIPEvent.
func (c *ProductionWIPEventClient) Delete() *ProductionWIPEventDelete {
	mutation := newProductionWIPEventMutation(c.config, OpDelete)
	return &ProductionWIPEventDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionWIPEventClient) DeleteOne(_m *ProductionWIPEvent) *ProductionWIPEventDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionWIPEventClient) DeleteOneID(id int) *ProductionWIPEventDeleteOne {
	builder := c.Delete().Where(productionwipevent.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionWIPEventDeleteOne{builder}
}

// Query returns a query builder for ProductionWIPEvent.
func (c *ProductionWIPEventClient) Query() *ProductionWIPEventQuery {
	return &ProductionWIPEventQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionWIPEvent},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionWIPEvent entity by its id.
func (c *ProductionWIPEventClient) Get(ctx context.Context, id int) (*ProductionWIPEvent, error) {
	return c.Query().Where(productionwipevent.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionWIPEventClient) GetX(ctx context.Context, id int) *ProductionWIPEvent {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionWipBatch queries the production_wip_batch edge of a ProductionWIPEvent.
func (c *ProductionWIPEventClient) QueryProductionWipBatch(_m *ProductionWIPEvent) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipevent.Table, productionwipevent.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipevent.ProductionWipBatchTable, productionwipevent.ProductionWipBatchColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryActor queries the actor edge of a ProductionWIPEvent.
func (c *ProductionWIPEventClient) QueryActor(_m *ProductionWIPEvent) *AdminUserQuery {
	query := (&AdminUserClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipevent.Table, productionwipevent.FieldID, id),
			sqlgraph.To(adminuser.Table, adminuser.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionwipevent.ActorTable, productionwipevent.ActorColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionWIPEventClient) Hooks() []Hook {
	hooks := c.hooks.ProductionWIPEvent
	return append(hooks[:len(hooks):len(hooks)], productionwipevent.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionWIPEventClient) Interceptors() []Interceptor {
	return c.inters.ProductionWIPEvent
}

func (c *ProductionWIPEventClient) mutate(ctx context.Context, m *ProductionWIPEventMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionWIPEventCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionWIPEventUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionWIPEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionWIPEventDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionWIPEvent mutation op: %q", m.Op())
	}
}

// ProductionWIPOutsourcingAllocationClient is a client for the ProductionWIPOutsourcingAllocation schema.
type ProductionWIPOutsourcingAllocationClient struct {
	config
}

// NewProductionWIPOutsourcingAllocationClient returns a client for the ProductionWIPOutsourcingAllocation from the given config.
func NewProductionWIPOutsourcingAllocationClient(c config) *ProductionWIPOutsourcingAllocationClient {
	return &ProductionWIPOutsourcingAllocationClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `productionwipoutsourcingallocation.Hooks(f(g(h())))`.
func (c *ProductionWIPOutsourcingAllocationClient) Use(hooks ...Hook) {
	c.hooks.ProductionWIPOutsourcingAllocation = append(c.hooks.ProductionWIPOutsourcingAllocation, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `productionwipoutsourcingallocation.Intercept(f(g(h())))`.
func (c *ProductionWIPOutsourcingAllocationClient) Intercept(interceptors ...Interceptor) {
	c.inters.ProductionWIPOutsourcingAllocation = append(c.inters.ProductionWIPOutsourcingAllocation, interceptors...)
}

// Create returns a builder for creating a ProductionWIPOutsourcingAllocation entity.
func (c *ProductionWIPOutsourcingAllocationClient) Create() *ProductionWIPOutsourcingAllocationCreate {
	mutation := newProductionWIPOutsourcingAllocationMutation(c.config, OpCreate)
	return &ProductionWIPOutsourcingAllocationCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ProductionWIPOutsourcingAllocation entities.
func (c *ProductionWIPOutsourcingAllocationClient) CreateBulk(builders ...*ProductionWIPOutsourcingAllocationCreate) *ProductionWIPOutsourcingAllocationCreateBulk {
	return &ProductionWIPOutsourcingAllocationCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ProductionWIPOutsourcingAllocationClient) MapCreateBulk(slice any, setFunc func(*ProductionWIPOutsourcingAllocationCreate, int)) *ProductionWIPOutsourcingAllocationCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ProductionWIPOutsourcingAllocationCreateBulk{err: fmt.Errorf("calling to ProductionWIPOutsourcingAllocationClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ProductionWIPOutsourcingAllocationCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ProductionWIPOutsourcingAllocationCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) Update() *ProductionWIPOutsourcingAllocationUpdate {
	mutation := newProductionWIPOutsourcingAllocationMutation(c.config, OpUpdate)
	return &ProductionWIPOutsourcingAllocationUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ProductionWIPOutsourcingAllocationClient) UpdateOne(_m *ProductionWIPOutsourcingAllocation) *ProductionWIPOutsourcingAllocationUpdateOne {
	mutation := newProductionWIPOutsourcingAllocationMutation(c.config, OpUpdateOne, withProductionWIPOutsourcingAllocation(_m))
	return &ProductionWIPOutsourcingAllocationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ProductionWIPOutsourcingAllocationClient) UpdateOneID(id int) *ProductionWIPOutsourcingAllocationUpdateOne {
	mutation := newProductionWIPOutsourcingAllocationMutation(c.config, OpUpdateOne, withProductionWIPOutsourcingAllocationID(id))
	return &ProductionWIPOutsourcingAllocationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) Delete() *ProductionWIPOutsourcingAllocationDelete {
	mutation := newProductionWIPOutsourcingAllocationMutation(c.config, OpDelete)
	return &ProductionWIPOutsourcingAllocationDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ProductionWIPOutsourcingAllocationClient) DeleteOne(_m *ProductionWIPOutsourcingAllocation) *ProductionWIPOutsourcingAllocationDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ProductionWIPOutsourcingAllocationClient) DeleteOneID(id int) *ProductionWIPOutsourcingAllocationDeleteOne {
	builder := c.Delete().Where(productionwipoutsourcingallocation.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ProductionWIPOutsourcingAllocationDeleteOne{builder}
}

// Query returns a query builder for ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) Query() *ProductionWIPOutsourcingAllocationQuery {
	return &ProductionWIPOutsourcingAllocationQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeProductionWIPOutsourcingAllocation},
		inters: c.Interceptors(),
	}
}

// Get returns a ProductionWIPOutsourcingAllocation entity by its id.
func (c *ProductionWIPOutsourcingAllocationClient) Get(ctx context.Context, id int) (*ProductionWIPOutsourcingAllocation, error) {
	return c.Query().Where(productionwipoutsourcingallocation.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ProductionWIPOutsourcingAllocationClient) GetX(ctx context.Context, id int) *ProductionWIPOutsourcingAllocation {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryProductionWipBatch queries the production_wip_batch edge of a ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) QueryProductionWipBatch(_m *ProductionWIPOutsourcingAllocation) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipoutsourcingallocation.ProductionWipBatchTable, productionwipoutsourcingallocation.ProductionWipBatchColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOutsourcingOrderItem queries the outsourcing_order_item edge of a ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) QueryOutsourcingOrderItem(_m *ProductionWIPOutsourcingAllocation) *OutsourcingOrderItemQuery {
	query := (&OutsourcingOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID, id),
			sqlgraph.To(outsourcingorderitem.Table, outsourcingorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipoutsourcingallocation.OutsourcingOrderItemTable, productionwipoutsourcingallocation.OutsourcingOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderMaterialRequirement queries the production_order_material_requirement edge of a ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) QueryProductionOrderMaterialRequirement(_m *ProductionWIPOutsourcingAllocation) *ProductionOrderMaterialRequirementQuery {
	query := (&ProductionOrderMaterialRequirementClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID, id),
			sqlgraph.To(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, productionwipoutsourcingallocation.ProductionOrderMaterialRequirementTable, productionwipoutsourcingallocation.ProductionOrderMaterialRequirementColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) QueryUnit(_m *ProductionWIPOutsourcingAllocation) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionwipoutsourcingallocation.UnitTable, productionwipoutsourcingallocation.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryCreator queries the creator edge of a ProductionWIPOutsourcingAllocation.
func (c *ProductionWIPOutsourcingAllocationClient) QueryCreator(_m *ProductionWIPOutsourcingAllocation) *AdminUserQuery {
	query := (&AdminUserClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(productionwipoutsourcingallocation.Table, productionwipoutsourcingallocation.FieldID, id),
			sqlgraph.To(adminuser.Table, adminuser.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, productionwipoutsourcingallocation.CreatorTable, productionwipoutsourcingallocation.CreatorColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ProductionWIPOutsourcingAllocationClient) Hooks() []Hook {
	hooks := c.hooks.ProductionWIPOutsourcingAllocation
	return append(hooks[:len(hooks):len(hooks)], productionwipoutsourcingallocation.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ProductionWIPOutsourcingAllocationClient) Interceptors() []Interceptor {
	return c.inters.ProductionWIPOutsourcingAllocation
}

func (c *ProductionWIPOutsourcingAllocationClient) mutate(ctx context.Context, m *ProductionWIPOutsourcingAllocationMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ProductionWIPOutsourcingAllocationCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ProductionWIPOutsourcingAllocationUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ProductionWIPOutsourcingAllocationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ProductionWIPOutsourcingAllocationDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ProductionWIPOutsourcingAllocation mutation op: %q", m.Op())
	}
}

// PurchaseOrderClient is a client for the PurchaseOrder schema.
type PurchaseOrderClient struct {
	config
}

// NewPurchaseOrderClient returns a client for the PurchaseOrder from the given config.
func NewPurchaseOrderClient(c config) *PurchaseOrderClient {
	return &PurchaseOrderClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchaseorder.Hooks(f(g(h())))`.
func (c *PurchaseOrderClient) Use(hooks ...Hook) {
	c.hooks.PurchaseOrder = append(c.hooks.PurchaseOrder, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchaseorder.Intercept(f(g(h())))`.
func (c *PurchaseOrderClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseOrder = append(c.inters.PurchaseOrder, interceptors...)
}

// Create returns a builder for creating a PurchaseOrder entity.
func (c *PurchaseOrderClient) Create() *PurchaseOrderCreate {
	mutation := newPurchaseOrderMutation(c.config, OpCreate)
	return &PurchaseOrderCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseOrder entities.
func (c *PurchaseOrderClient) CreateBulk(builders ...*PurchaseOrderCreate) *PurchaseOrderCreateBulk {
	return &PurchaseOrderCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseOrderClient) MapCreateBulk(slice any, setFunc func(*PurchaseOrderCreate, int)) *PurchaseOrderCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseOrderCreateBulk{err: fmt.Errorf("calling to PurchaseOrderClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseOrderCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseOrderCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseOrder.
func (c *PurchaseOrderClient) Update() *PurchaseOrderUpdate {
	mutation := newPurchaseOrderMutation(c.config, OpUpdate)
	return &PurchaseOrderUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseOrderClient) UpdateOne(_m *PurchaseOrder) *PurchaseOrderUpdateOne {
	mutation := newPurchaseOrderMutation(c.config, OpUpdateOne, withPurchaseOrder(_m))
	return &PurchaseOrderUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseOrderClient) UpdateOneID(id int) *PurchaseOrderUpdateOne {
	mutation := newPurchaseOrderMutation(c.config, OpUpdateOne, withPurchaseOrderID(id))
	return &PurchaseOrderUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseOrder.
func (c *PurchaseOrderClient) Delete() *PurchaseOrderDelete {
	mutation := newPurchaseOrderMutation(c.config, OpDelete)
	return &PurchaseOrderDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseOrderClient) DeleteOne(_m *PurchaseOrder) *PurchaseOrderDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseOrderClient) DeleteOneID(id int) *PurchaseOrderDeleteOne {
	builder := c.Delete().Where(purchaseorder.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseOrderDeleteOne{builder}
}

// Query returns a query builder for PurchaseOrder.
func (c *PurchaseOrderClient) Query() *PurchaseOrderQuery {
	return &PurchaseOrderQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseOrder},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseOrder entity by its id.
func (c *PurchaseOrderClient) Get(ctx context.Context, id int) (*PurchaseOrder, error) {
	return c.Query().Where(purchaseorder.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseOrderClient) GetX(ctx context.Context, id int) *PurchaseOrder {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryEngineeringMaterialRequest queries the engineering_material_request edge of a PurchaseOrder.
func (c *PurchaseOrderClient) QueryEngineeringMaterialRequest(_m *PurchaseOrder) *EngineeringMaterialRequestQuery {
	query := (&EngineeringMaterialRequestClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorder.Table, purchaseorder.FieldID, id),
			sqlgraph.To(engineeringmaterialrequest.Table, engineeringmaterialrequest.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, purchaseorder.EngineeringMaterialRequestTable, purchaseorder.EngineeringMaterialRequestColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QuerySupplier queries the supplier edge of a PurchaseOrder.
func (c *PurchaseOrderClient) QuerySupplier(_m *PurchaseOrder) *SupplierQuery {
	query := (&SupplierClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorder.Table, purchaseorder.FieldID, id),
			sqlgraph.To(supplier.Table, supplier.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchaseorder.SupplierTable, purchaseorder.SupplierColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryItems queries the items edge of a PurchaseOrder.
func (c *PurchaseOrderClient) QueryItems(_m *PurchaseOrder) *PurchaseOrderItemQuery {
	query := (&PurchaseOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorder.Table, purchaseorder.FieldID, id),
			sqlgraph.To(purchaseorderitem.Table, purchaseorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchaseorder.ItemsTable, purchaseorder.ItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseOrderClient) Hooks() []Hook {
	return c.hooks.PurchaseOrder
}

// Interceptors returns the client interceptors.
func (c *PurchaseOrderClient) Interceptors() []Interceptor {
	return c.inters.PurchaseOrder
}

func (c *PurchaseOrderClient) mutate(ctx context.Context, m *PurchaseOrderMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseOrderCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseOrderUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseOrderUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseOrderDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseOrder mutation op: %q", m.Op())
	}
}

// PurchaseOrderItemClient is a client for the PurchaseOrderItem schema.
type PurchaseOrderItemClient struct {
	config
}

// NewPurchaseOrderItemClient returns a client for the PurchaseOrderItem from the given config.
func NewPurchaseOrderItemClient(c config) *PurchaseOrderItemClient {
	return &PurchaseOrderItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchaseorderitem.Hooks(f(g(h())))`.
func (c *PurchaseOrderItemClient) Use(hooks ...Hook) {
	c.hooks.PurchaseOrderItem = append(c.hooks.PurchaseOrderItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchaseorderitem.Intercept(f(g(h())))`.
func (c *PurchaseOrderItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseOrderItem = append(c.inters.PurchaseOrderItem, interceptors...)
}

// Create returns a builder for creating a PurchaseOrderItem entity.
func (c *PurchaseOrderItemClient) Create() *PurchaseOrderItemCreate {
	mutation := newPurchaseOrderItemMutation(c.config, OpCreate)
	return &PurchaseOrderItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseOrderItem entities.
func (c *PurchaseOrderItemClient) CreateBulk(builders ...*PurchaseOrderItemCreate) *PurchaseOrderItemCreateBulk {
	return &PurchaseOrderItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseOrderItemClient) MapCreateBulk(slice any, setFunc func(*PurchaseOrderItemCreate, int)) *PurchaseOrderItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseOrderItemCreateBulk{err: fmt.Errorf("calling to PurchaseOrderItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseOrderItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseOrderItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseOrderItem.
func (c *PurchaseOrderItemClient) Update() *PurchaseOrderItemUpdate {
	mutation := newPurchaseOrderItemMutation(c.config, OpUpdate)
	return &PurchaseOrderItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseOrderItemClient) UpdateOne(_m *PurchaseOrderItem) *PurchaseOrderItemUpdateOne {
	mutation := newPurchaseOrderItemMutation(c.config, OpUpdateOne, withPurchaseOrderItem(_m))
	return &PurchaseOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseOrderItemClient) UpdateOneID(id int) *PurchaseOrderItemUpdateOne {
	mutation := newPurchaseOrderItemMutation(c.config, OpUpdateOne, withPurchaseOrderItemID(id))
	return &PurchaseOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseOrderItem.
func (c *PurchaseOrderItemClient) Delete() *PurchaseOrderItemDelete {
	mutation := newPurchaseOrderItemMutation(c.config, OpDelete)
	return &PurchaseOrderItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseOrderItemClient) DeleteOne(_m *PurchaseOrderItem) *PurchaseOrderItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseOrderItemClient) DeleteOneID(id int) *PurchaseOrderItemDeleteOne {
	builder := c.Delete().Where(purchaseorderitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseOrderItemDeleteOne{builder}
}

// Query returns a query builder for PurchaseOrderItem.
func (c *PurchaseOrderItemClient) Query() *PurchaseOrderItemQuery {
	return &PurchaseOrderItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseOrderItem},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseOrderItem entity by its id.
func (c *PurchaseOrderItemClient) Get(ctx context.Context, id int) (*PurchaseOrderItem, error) {
	return c.Query().Where(purchaseorderitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseOrderItemClient) GetX(ctx context.Context, id int) *PurchaseOrderItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryPurchaseOrder queries the purchase_order edge of a PurchaseOrderItem.
func (c *PurchaseOrderItemClient) QueryPurchaseOrder(_m *PurchaseOrderItem) *PurchaseOrderQuery {
	query := (&PurchaseOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorderitem.Table, purchaseorderitem.FieldID, id),
			sqlgraph.To(purchaseorder.Table, purchaseorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchaseorderitem.PurchaseOrderTable, purchaseorderitem.PurchaseOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterial queries the material edge of a PurchaseOrderItem.
func (c *PurchaseOrderItemClient) QueryMaterial(_m *PurchaseOrderItem) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorderitem.Table, purchaseorderitem.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchaseorderitem.MaterialTable, purchaseorderitem.MaterialColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a PurchaseOrderItem.
func (c *PurchaseOrderItemClient) QueryUnit(_m *PurchaseOrderItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorderitem.Table, purchaseorderitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchaseorderitem.UnitTable, purchaseorderitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptItems queries the purchase_receipt_items edge of a PurchaseOrderItem.
func (c *PurchaseOrderItemClient) QueryPurchaseReceiptItems(_m *PurchaseOrderItem) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaseorderitem.Table, purchaseorderitem.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchaseorderitem.PurchaseReceiptItemsTable, purchaseorderitem.PurchaseReceiptItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseOrderItemClient) Hooks() []Hook {
	return c.hooks.PurchaseOrderItem
}

// Interceptors returns the client interceptors.
func (c *PurchaseOrderItemClient) Interceptors() []Interceptor {
	return c.inters.PurchaseOrderItem
}

func (c *PurchaseOrderItemClient) mutate(ctx context.Context, m *PurchaseOrderItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseOrderItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseOrderItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseOrderItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseOrderItem mutation op: %q", m.Op())
	}
}

// PurchaseReceiptClient is a client for the PurchaseReceipt schema.
type PurchaseReceiptClient struct {
	config
}

// NewPurchaseReceiptClient returns a client for the PurchaseReceipt from the given config.
func NewPurchaseReceiptClient(c config) *PurchaseReceiptClient {
	return &PurchaseReceiptClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchasereceipt.Hooks(f(g(h())))`.
func (c *PurchaseReceiptClient) Use(hooks ...Hook) {
	c.hooks.PurchaseReceipt = append(c.hooks.PurchaseReceipt, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchasereceipt.Intercept(f(g(h())))`.
func (c *PurchaseReceiptClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseReceipt = append(c.inters.PurchaseReceipt, interceptors...)
}

// Create returns a builder for creating a PurchaseReceipt entity.
func (c *PurchaseReceiptClient) Create() *PurchaseReceiptCreate {
	mutation := newPurchaseReceiptMutation(c.config, OpCreate)
	return &PurchaseReceiptCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseReceipt entities.
func (c *PurchaseReceiptClient) CreateBulk(builders ...*PurchaseReceiptCreate) *PurchaseReceiptCreateBulk {
	return &PurchaseReceiptCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseReceiptClient) MapCreateBulk(slice any, setFunc func(*PurchaseReceiptCreate, int)) *PurchaseReceiptCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseReceiptCreateBulk{err: fmt.Errorf("calling to PurchaseReceiptClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseReceiptCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseReceiptCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseReceipt.
func (c *PurchaseReceiptClient) Update() *PurchaseReceiptUpdate {
	mutation := newPurchaseReceiptMutation(c.config, OpUpdate)
	return &PurchaseReceiptUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseReceiptClient) UpdateOne(_m *PurchaseReceipt) *PurchaseReceiptUpdateOne {
	mutation := newPurchaseReceiptMutation(c.config, OpUpdateOne, withPurchaseReceipt(_m))
	return &PurchaseReceiptUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseReceiptClient) UpdateOneID(id int) *PurchaseReceiptUpdateOne {
	mutation := newPurchaseReceiptMutation(c.config, OpUpdateOne, withPurchaseReceiptID(id))
	return &PurchaseReceiptUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseReceipt.
func (c *PurchaseReceiptClient) Delete() *PurchaseReceiptDelete {
	mutation := newPurchaseReceiptMutation(c.config, OpDelete)
	return &PurchaseReceiptDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseReceiptClient) DeleteOne(_m *PurchaseReceipt) *PurchaseReceiptDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseReceiptClient) DeleteOneID(id int) *PurchaseReceiptDeleteOne {
	builder := c.Delete().Where(purchasereceipt.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseReceiptDeleteOne{builder}
}

// Query returns a query builder for PurchaseReceipt.
func (c *PurchaseReceiptClient) Query() *PurchaseReceiptQuery {
	return &PurchaseReceiptQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseReceipt},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseReceipt entity by its id.
func (c *PurchaseReceiptClient) Get(ctx context.Context, id int) (*PurchaseReceipt, error) {
	return c.Query().Where(purchasereceipt.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseReceiptClient) GetX(ctx context.Context, id int) *PurchaseReceipt {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QuerySupplier queries the supplier edge of a PurchaseReceipt.
func (c *PurchaseReceiptClient) QuerySupplier(_m *PurchaseReceipt) *SupplierQuery {
	query := (&SupplierClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceipt.Table, purchasereceipt.FieldID, id),
			sqlgraph.To(supplier.Table, supplier.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceipt.SupplierTable, purchasereceipt.SupplierColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReturns queries the purchase_returns edge of a PurchaseReceipt.
func (c *PurchaseReceiptClient) QueryPurchaseReturns(_m *PurchaseReceipt) *PurchaseReturnQuery {
	query := (&PurchaseReturnClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceipt.Table, purchasereceipt.FieldID, id),
			sqlgraph.To(purchasereturn.Table, purchasereturn.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceipt.PurchaseReturnsTable, purchasereceipt.PurchaseReturnsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptAdjustments queries the purchase_receipt_adjustments edge of a PurchaseReceipt.
func (c *PurchaseReceiptClient) QueryPurchaseReceiptAdjustments(_m *PurchaseReceipt) *PurchaseReceiptAdjustmentQuery {
	query := (&PurchaseReceiptAdjustmentClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceipt.Table, purchasereceipt.FieldID, id),
			sqlgraph.To(purchasereceiptadjustment.Table, purchasereceiptadjustment.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceipt.PurchaseReceiptAdjustmentsTable, purchasereceipt.PurchaseReceiptAdjustmentsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryQualityInspections queries the quality_inspections edge of a PurchaseReceipt.
func (c *PurchaseReceiptClient) QueryQualityInspections(_m *PurchaseReceipt) *QualityInspectionQuery {
	query := (&QualityInspectionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceipt.Table, purchasereceipt.FieldID, id),
			sqlgraph.To(qualityinspection.Table, qualityinspection.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceipt.QualityInspectionsTable, purchasereceipt.QualityInspectionsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryReplacementDispositions queries the replacement_dispositions edge of a PurchaseReceipt.
func (c *PurchaseReceiptClient) QueryReplacementDispositions(_m *PurchaseReceipt) *PurchaseRejectionDispositionQuery {
	query := (&PurchaseRejectionDispositionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceipt.Table, purchasereceipt.FieldID, id),
			sqlgraph.To(purchaserejectiondisposition.Table, purchaserejectiondisposition.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceipt.ReplacementDispositionsTable, purchasereceipt.ReplacementDispositionsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryItems queries the items edge of a PurchaseReceipt.
func (c *PurchaseReceiptClient) QueryItems(_m *PurchaseReceipt) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceipt.Table, purchasereceipt.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceipt.ItemsTable, purchasereceipt.ItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseReceiptClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseReceipt
	return append(hooks[:len(hooks):len(hooks)], purchasereceipt.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseReceiptClient) Interceptors() []Interceptor {
	return c.inters.PurchaseReceipt
}

func (c *PurchaseReceiptClient) mutate(ctx context.Context, m *PurchaseReceiptMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseReceiptCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseReceiptUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseReceiptUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseReceiptDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseReceipt mutation op: %q", m.Op())
	}
}

// PurchaseReceiptAdjustmentClient is a client for the PurchaseReceiptAdjustment schema.
type PurchaseReceiptAdjustmentClient struct {
	config
}

// NewPurchaseReceiptAdjustmentClient returns a client for the PurchaseReceiptAdjustment from the given config.
func NewPurchaseReceiptAdjustmentClient(c config) *PurchaseReceiptAdjustmentClient {
	return &PurchaseReceiptAdjustmentClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchasereceiptadjustment.Hooks(f(g(h())))`.
func (c *PurchaseReceiptAdjustmentClient) Use(hooks ...Hook) {
	c.hooks.PurchaseReceiptAdjustment = append(c.hooks.PurchaseReceiptAdjustment, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchasereceiptadjustment.Intercept(f(g(h())))`.
func (c *PurchaseReceiptAdjustmentClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseReceiptAdjustment = append(c.inters.PurchaseReceiptAdjustment, interceptors...)
}

// Create returns a builder for creating a PurchaseReceiptAdjustment entity.
func (c *PurchaseReceiptAdjustmentClient) Create() *PurchaseReceiptAdjustmentCreate {
	mutation := newPurchaseReceiptAdjustmentMutation(c.config, OpCreate)
	return &PurchaseReceiptAdjustmentCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseReceiptAdjustment entities.
func (c *PurchaseReceiptAdjustmentClient) CreateBulk(builders ...*PurchaseReceiptAdjustmentCreate) *PurchaseReceiptAdjustmentCreateBulk {
	return &PurchaseReceiptAdjustmentCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseReceiptAdjustmentClient) MapCreateBulk(slice any, setFunc func(*PurchaseReceiptAdjustmentCreate, int)) *PurchaseReceiptAdjustmentCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseReceiptAdjustmentCreateBulk{err: fmt.Errorf("calling to PurchaseReceiptAdjustmentClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseReceiptAdjustmentCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseReceiptAdjustmentCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseReceiptAdjustment.
func (c *PurchaseReceiptAdjustmentClient) Update() *PurchaseReceiptAdjustmentUpdate {
	mutation := newPurchaseReceiptAdjustmentMutation(c.config, OpUpdate)
	return &PurchaseReceiptAdjustmentUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseReceiptAdjustmentClient) UpdateOne(_m *PurchaseReceiptAdjustment) *PurchaseReceiptAdjustmentUpdateOne {
	mutation := newPurchaseReceiptAdjustmentMutation(c.config, OpUpdateOne, withPurchaseReceiptAdjustment(_m))
	return &PurchaseReceiptAdjustmentUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseReceiptAdjustmentClient) UpdateOneID(id int) *PurchaseReceiptAdjustmentUpdateOne {
	mutation := newPurchaseReceiptAdjustmentMutation(c.config, OpUpdateOne, withPurchaseReceiptAdjustmentID(id))
	return &PurchaseReceiptAdjustmentUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseReceiptAdjustment.
func (c *PurchaseReceiptAdjustmentClient) Delete() *PurchaseReceiptAdjustmentDelete {
	mutation := newPurchaseReceiptAdjustmentMutation(c.config, OpDelete)
	return &PurchaseReceiptAdjustmentDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseReceiptAdjustmentClient) DeleteOne(_m *PurchaseReceiptAdjustment) *PurchaseReceiptAdjustmentDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseReceiptAdjustmentClient) DeleteOneID(id int) *PurchaseReceiptAdjustmentDeleteOne {
	builder := c.Delete().Where(purchasereceiptadjustment.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseReceiptAdjustmentDeleteOne{builder}
}

// Query returns a query builder for PurchaseReceiptAdjustment.
func (c *PurchaseReceiptAdjustmentClient) Query() *PurchaseReceiptAdjustmentQuery {
	return &PurchaseReceiptAdjustmentQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseReceiptAdjustment},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseReceiptAdjustment entity by its id.
func (c *PurchaseReceiptAdjustmentClient) Get(ctx context.Context, id int) (*PurchaseReceiptAdjustment, error) {
	return c.Query().Where(purchasereceiptadjustment.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseReceiptAdjustmentClient) GetX(ctx context.Context, id int) *PurchaseReceiptAdjustment {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryPurchaseReceipt queries the purchase_receipt edge of a PurchaseReceiptAdjustment.
func (c *PurchaseReceiptAdjustmentClient) QueryPurchaseReceipt(_m *PurchaseReceiptAdjustment) *PurchaseReceiptQuery {
	query := (&PurchaseReceiptClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustment.Table, purchasereceiptadjustment.FieldID, id),
			sqlgraph.To(purchasereceipt.Table, purchasereceipt.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustment.PurchaseReceiptTable, purchasereceiptadjustment.PurchaseReceiptColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryItems queries the items edge of a PurchaseReceiptAdjustment.
func (c *PurchaseReceiptAdjustmentClient) QueryItems(_m *PurchaseReceiptAdjustment) *PurchaseReceiptAdjustmentItemQuery {
	query := (&PurchaseReceiptAdjustmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustment.Table, purchasereceiptadjustment.FieldID, id),
			sqlgraph.To(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceiptadjustment.ItemsTable, purchasereceiptadjustment.ItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseReceiptAdjustmentClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseReceiptAdjustment
	return append(hooks[:len(hooks):len(hooks)], purchasereceiptadjustment.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseReceiptAdjustmentClient) Interceptors() []Interceptor {
	return c.inters.PurchaseReceiptAdjustment
}

func (c *PurchaseReceiptAdjustmentClient) mutate(ctx context.Context, m *PurchaseReceiptAdjustmentMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseReceiptAdjustmentCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseReceiptAdjustmentUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseReceiptAdjustmentUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseReceiptAdjustmentDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseReceiptAdjustment mutation op: %q", m.Op())
	}
}

// PurchaseReceiptAdjustmentItemClient is a client for the PurchaseReceiptAdjustmentItem schema.
type PurchaseReceiptAdjustmentItemClient struct {
	config
}

// NewPurchaseReceiptAdjustmentItemClient returns a client for the PurchaseReceiptAdjustmentItem from the given config.
func NewPurchaseReceiptAdjustmentItemClient(c config) *PurchaseReceiptAdjustmentItemClient {
	return &PurchaseReceiptAdjustmentItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchasereceiptadjustmentitem.Hooks(f(g(h())))`.
func (c *PurchaseReceiptAdjustmentItemClient) Use(hooks ...Hook) {
	c.hooks.PurchaseReceiptAdjustmentItem = append(c.hooks.PurchaseReceiptAdjustmentItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchasereceiptadjustmentitem.Intercept(f(g(h())))`.
func (c *PurchaseReceiptAdjustmentItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseReceiptAdjustmentItem = append(c.inters.PurchaseReceiptAdjustmentItem, interceptors...)
}

// Create returns a builder for creating a PurchaseReceiptAdjustmentItem entity.
func (c *PurchaseReceiptAdjustmentItemClient) Create() *PurchaseReceiptAdjustmentItemCreate {
	mutation := newPurchaseReceiptAdjustmentItemMutation(c.config, OpCreate)
	return &PurchaseReceiptAdjustmentItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseReceiptAdjustmentItem entities.
func (c *PurchaseReceiptAdjustmentItemClient) CreateBulk(builders ...*PurchaseReceiptAdjustmentItemCreate) *PurchaseReceiptAdjustmentItemCreateBulk {
	return &PurchaseReceiptAdjustmentItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseReceiptAdjustmentItemClient) MapCreateBulk(slice any, setFunc func(*PurchaseReceiptAdjustmentItemCreate, int)) *PurchaseReceiptAdjustmentItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseReceiptAdjustmentItemCreateBulk{err: fmt.Errorf("calling to PurchaseReceiptAdjustmentItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseReceiptAdjustmentItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseReceiptAdjustmentItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) Update() *PurchaseReceiptAdjustmentItemUpdate {
	mutation := newPurchaseReceiptAdjustmentItemMutation(c.config, OpUpdate)
	return &PurchaseReceiptAdjustmentItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseReceiptAdjustmentItemClient) UpdateOne(_m *PurchaseReceiptAdjustmentItem) *PurchaseReceiptAdjustmentItemUpdateOne {
	mutation := newPurchaseReceiptAdjustmentItemMutation(c.config, OpUpdateOne, withPurchaseReceiptAdjustmentItem(_m))
	return &PurchaseReceiptAdjustmentItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseReceiptAdjustmentItemClient) UpdateOneID(id int) *PurchaseReceiptAdjustmentItemUpdateOne {
	mutation := newPurchaseReceiptAdjustmentItemMutation(c.config, OpUpdateOne, withPurchaseReceiptAdjustmentItemID(id))
	return &PurchaseReceiptAdjustmentItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) Delete() *PurchaseReceiptAdjustmentItemDelete {
	mutation := newPurchaseReceiptAdjustmentItemMutation(c.config, OpDelete)
	return &PurchaseReceiptAdjustmentItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseReceiptAdjustmentItemClient) DeleteOne(_m *PurchaseReceiptAdjustmentItem) *PurchaseReceiptAdjustmentItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseReceiptAdjustmentItemClient) DeleteOneID(id int) *PurchaseReceiptAdjustmentItemDeleteOne {
	builder := c.Delete().Where(purchasereceiptadjustmentitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseReceiptAdjustmentItemDeleteOne{builder}
}

// Query returns a query builder for PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) Query() *PurchaseReceiptAdjustmentItemQuery {
	return &PurchaseReceiptAdjustmentItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseReceiptAdjustmentItem},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseReceiptAdjustmentItem entity by its id.
func (c *PurchaseReceiptAdjustmentItemClient) Get(ctx context.Context, id int) (*PurchaseReceiptAdjustmentItem, error) {
	return c.Query().Where(purchasereceiptadjustmentitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseReceiptAdjustmentItemClient) GetX(ctx context.Context, id int) *PurchaseReceiptAdjustmentItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryPurchaseReceiptAdjustment queries the purchase_receipt_adjustment edge of a PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) QueryPurchaseReceiptAdjustment(_m *PurchaseReceiptAdjustmentItem) *PurchaseReceiptAdjustmentQuery {
	query := (&PurchaseReceiptAdjustmentClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID, id),
			sqlgraph.To(purchasereceiptadjustment.Table, purchasereceiptadjustment.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustmentitem.PurchaseReceiptAdjustmentTable, purchasereceiptadjustmentitem.PurchaseReceiptAdjustmentColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptItem queries the purchase_receipt_item edge of a PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) QueryPurchaseReceiptItem(_m *PurchaseReceiptAdjustmentItem) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustmentitem.PurchaseReceiptItemTable, purchasereceiptadjustmentitem.PurchaseReceiptItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterial queries the material edge of a PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) QueryMaterial(_m *PurchaseReceiptAdjustmentItem) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustmentitem.MaterialTable, purchasereceiptadjustmentitem.MaterialColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWarehouse queries the warehouse edge of a PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) QueryWarehouse(_m *PurchaseReceiptAdjustmentItem) *WarehouseQuery {
	query := (&WarehouseClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID, id),
			sqlgraph.To(warehouse.Table, warehouse.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustmentitem.WarehouseTable, purchasereceiptadjustmentitem.WarehouseColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) QueryUnit(_m *PurchaseReceiptAdjustmentItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustmentitem.UnitTable, purchasereceiptadjustmentitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryLot queries the inventory_lot edge of a PurchaseReceiptAdjustmentItem.
func (c *PurchaseReceiptAdjustmentItemClient) QueryInventoryLot(_m *PurchaseReceiptAdjustmentItem) *InventoryLotQuery {
	query := (&InventoryLotClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID, id),
			sqlgraph.To(inventorylot.Table, inventorylot.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptadjustmentitem.InventoryLotTable, purchasereceiptadjustmentitem.InventoryLotColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseReceiptAdjustmentItemClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseReceiptAdjustmentItem
	return append(hooks[:len(hooks):len(hooks)], purchasereceiptadjustmentitem.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseReceiptAdjustmentItemClient) Interceptors() []Interceptor {
	return c.inters.PurchaseReceiptAdjustmentItem
}

func (c *PurchaseReceiptAdjustmentItemClient) mutate(ctx context.Context, m *PurchaseReceiptAdjustmentItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseReceiptAdjustmentItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseReceiptAdjustmentItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseReceiptAdjustmentItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseReceiptAdjustmentItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseReceiptAdjustmentItem mutation op: %q", m.Op())
	}
}

// PurchaseReceiptItemClient is a client for the PurchaseReceiptItem schema.
type PurchaseReceiptItemClient struct {
	config
}

// NewPurchaseReceiptItemClient returns a client for the PurchaseReceiptItem from the given config.
func NewPurchaseReceiptItemClient(c config) *PurchaseReceiptItemClient {
	return &PurchaseReceiptItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchasereceiptitem.Hooks(f(g(h())))`.
func (c *PurchaseReceiptItemClient) Use(hooks ...Hook) {
	c.hooks.PurchaseReceiptItem = append(c.hooks.PurchaseReceiptItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchasereceiptitem.Intercept(f(g(h())))`.
func (c *PurchaseReceiptItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseReceiptItem = append(c.inters.PurchaseReceiptItem, interceptors...)
}

// Create returns a builder for creating a PurchaseReceiptItem entity.
func (c *PurchaseReceiptItemClient) Create() *PurchaseReceiptItemCreate {
	mutation := newPurchaseReceiptItemMutation(c.config, OpCreate)
	return &PurchaseReceiptItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseReceiptItem entities.
func (c *PurchaseReceiptItemClient) CreateBulk(builders ...*PurchaseReceiptItemCreate) *PurchaseReceiptItemCreateBulk {
	return &PurchaseReceiptItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseReceiptItemClient) MapCreateBulk(slice any, setFunc func(*PurchaseReceiptItemCreate, int)) *PurchaseReceiptItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseReceiptItemCreateBulk{err: fmt.Errorf("calling to PurchaseReceiptItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseReceiptItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseReceiptItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) Update() *PurchaseReceiptItemUpdate {
	mutation := newPurchaseReceiptItemMutation(c.config, OpUpdate)
	return &PurchaseReceiptItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseReceiptItemClient) UpdateOne(_m *PurchaseReceiptItem) *PurchaseReceiptItemUpdateOne {
	mutation := newPurchaseReceiptItemMutation(c.config, OpUpdateOne, withPurchaseReceiptItem(_m))
	return &PurchaseReceiptItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseReceiptItemClient) UpdateOneID(id int) *PurchaseReceiptItemUpdateOne {
	mutation := newPurchaseReceiptItemMutation(c.config, OpUpdateOne, withPurchaseReceiptItemID(id))
	return &PurchaseReceiptItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) Delete() *PurchaseReceiptItemDelete {
	mutation := newPurchaseReceiptItemMutation(c.config, OpDelete)
	return &PurchaseReceiptItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseReceiptItemClient) DeleteOne(_m *PurchaseReceiptItem) *PurchaseReceiptItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseReceiptItemClient) DeleteOneID(id int) *PurchaseReceiptItemDeleteOne {
	builder := c.Delete().Where(purchasereceiptitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseReceiptItemDeleteOne{builder}
}

// Query returns a query builder for PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) Query() *PurchaseReceiptItemQuery {
	return &PurchaseReceiptItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseReceiptItem},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseReceiptItem entity by its id.
func (c *PurchaseReceiptItemClient) Get(ctx context.Context, id int) (*PurchaseReceiptItem, error) {
	return c.Query().Where(purchasereceiptitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseReceiptItemClient) GetX(ctx context.Context, id int) *PurchaseReceiptItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryReceipt queries the receipt edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryReceipt(_m *PurchaseReceiptItem) *PurchaseReceiptQuery {
	query := (&PurchaseReceiptClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(purchasereceipt.Table, purchasereceipt.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptitem.ReceiptTable, purchasereceiptitem.ReceiptColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterial queries the material edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryMaterial(_m *PurchaseReceiptItem) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptitem.MaterialTable, purchasereceiptitem.MaterialColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWarehouse queries the warehouse edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryWarehouse(_m *PurchaseReceiptItem) *WarehouseQuery {
	query := (&WarehouseClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(warehouse.Table, warehouse.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptitem.WarehouseTable, purchasereceiptitem.WarehouseColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryUnit(_m *PurchaseReceiptItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptitem.UnitTable, purchasereceiptitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryLot queries the inventory_lot edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryInventoryLot(_m *PurchaseReceiptItem) *InventoryLotQuery {
	query := (&InventoryLotClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(inventorylot.Table, inventorylot.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptitem.InventoryLotTable, purchasereceiptitem.InventoryLotColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseOrderItem queries the purchase_order_item edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryPurchaseOrderItem(_m *PurchaseReceiptItem) *PurchaseOrderItemQuery {
	query := (&PurchaseOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(purchaseorderitem.Table, purchaseorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereceiptitem.PurchaseOrderItemTable, purchasereceiptitem.PurchaseOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReturnItems queries the purchase_return_items edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryPurchaseReturnItems(_m *PurchaseReceiptItem) *PurchaseReturnItemQuery {
	query := (&PurchaseReturnItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(purchasereturnitem.Table, purchasereturnitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceiptitem.PurchaseReturnItemsTable, purchasereceiptitem.PurchaseReturnItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptAdjustmentItems queries the purchase_receipt_adjustment_items edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryPurchaseReceiptAdjustmentItems(_m *PurchaseReceiptItem) *PurchaseReceiptAdjustmentItemQuery {
	query := (&PurchaseReceiptAdjustmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceiptitem.PurchaseReceiptAdjustmentItemsTable, purchasereceiptitem.PurchaseReceiptAdjustmentItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryQualityInspections queries the quality_inspections edge of a PurchaseReceiptItem.
func (c *PurchaseReceiptItemClient) QueryQualityInspections(_m *PurchaseReceiptItem) *QualityInspectionQuery {
	query := (&QualityInspectionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereceiptitem.Table, purchasereceiptitem.FieldID, id),
			sqlgraph.To(qualityinspection.Table, qualityinspection.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereceiptitem.QualityInspectionsTable, purchasereceiptitem.QualityInspectionsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseReceiptItemClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseReceiptItem
	return append(hooks[:len(hooks):len(hooks)], purchasereceiptitem.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseReceiptItemClient) Interceptors() []Interceptor {
	return c.inters.PurchaseReceiptItem
}

func (c *PurchaseReceiptItemClient) mutate(ctx context.Context, m *PurchaseReceiptItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseReceiptItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseReceiptItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseReceiptItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseReceiptItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseReceiptItem mutation op: %q", m.Op())
	}
}

// PurchaseRejectionDispositionClient is a client for the PurchaseRejectionDisposition schema.
type PurchaseRejectionDispositionClient struct {
	config
}

// NewPurchaseRejectionDispositionClient returns a client for the PurchaseRejectionDisposition from the given config.
func NewPurchaseRejectionDispositionClient(c config) *PurchaseRejectionDispositionClient {
	return &PurchaseRejectionDispositionClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchaserejectiondisposition.Hooks(f(g(h())))`.
func (c *PurchaseRejectionDispositionClient) Use(hooks ...Hook) {
	c.hooks.PurchaseRejectionDisposition = append(c.hooks.PurchaseRejectionDisposition, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchaserejectiondisposition.Intercept(f(g(h())))`.
func (c *PurchaseRejectionDispositionClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseRejectionDisposition = append(c.inters.PurchaseRejectionDisposition, interceptors...)
}

// Create returns a builder for creating a PurchaseRejectionDisposition entity.
func (c *PurchaseRejectionDispositionClient) Create() *PurchaseRejectionDispositionCreate {
	mutation := newPurchaseRejectionDispositionMutation(c.config, OpCreate)
	return &PurchaseRejectionDispositionCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseRejectionDisposition entities.
func (c *PurchaseRejectionDispositionClient) CreateBulk(builders ...*PurchaseRejectionDispositionCreate) *PurchaseRejectionDispositionCreateBulk {
	return &PurchaseRejectionDispositionCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseRejectionDispositionClient) MapCreateBulk(slice any, setFunc func(*PurchaseRejectionDispositionCreate, int)) *PurchaseRejectionDispositionCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseRejectionDispositionCreateBulk{err: fmt.Errorf("calling to PurchaseRejectionDispositionClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseRejectionDispositionCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseRejectionDispositionCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseRejectionDisposition.
func (c *PurchaseRejectionDispositionClient) Update() *PurchaseRejectionDispositionUpdate {
	mutation := newPurchaseRejectionDispositionMutation(c.config, OpUpdate)
	return &PurchaseRejectionDispositionUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseRejectionDispositionClient) UpdateOne(_m *PurchaseRejectionDisposition) *PurchaseRejectionDispositionUpdateOne {
	mutation := newPurchaseRejectionDispositionMutation(c.config, OpUpdateOne, withPurchaseRejectionDisposition(_m))
	return &PurchaseRejectionDispositionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseRejectionDispositionClient) UpdateOneID(id int) *PurchaseRejectionDispositionUpdateOne {
	mutation := newPurchaseRejectionDispositionMutation(c.config, OpUpdateOne, withPurchaseRejectionDispositionID(id))
	return &PurchaseRejectionDispositionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseRejectionDisposition.
func (c *PurchaseRejectionDispositionClient) Delete() *PurchaseRejectionDispositionDelete {
	mutation := newPurchaseRejectionDispositionMutation(c.config, OpDelete)
	return &PurchaseRejectionDispositionDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseRejectionDispositionClient) DeleteOne(_m *PurchaseRejectionDisposition) *PurchaseRejectionDispositionDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseRejectionDispositionClient) DeleteOneID(id int) *PurchaseRejectionDispositionDeleteOne {
	builder := c.Delete().Where(purchaserejectiondisposition.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseRejectionDispositionDeleteOne{builder}
}

// Query returns a query builder for PurchaseRejectionDisposition.
func (c *PurchaseRejectionDispositionClient) Query() *PurchaseRejectionDispositionQuery {
	return &PurchaseRejectionDispositionQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseRejectionDisposition},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseRejectionDisposition entity by its id.
func (c *PurchaseRejectionDispositionClient) Get(ctx context.Context, id int) (*PurchaseRejectionDisposition, error) {
	return c.Query().Where(purchaserejectiondisposition.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseRejectionDispositionClient) GetX(ctx context.Context, id int) *PurchaseRejectionDisposition {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryReplacementReceipt queries the replacement_receipt edge of a PurchaseRejectionDisposition.
func (c *PurchaseRejectionDispositionClient) QueryReplacementReceipt(_m *PurchaseRejectionDisposition) *PurchaseReceiptQuery {
	query := (&PurchaseReceiptClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchaserejectiondisposition.Table, purchaserejectiondisposition.FieldID, id),
			sqlgraph.To(purchasereceipt.Table, purchasereceipt.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchaserejectiondisposition.ReplacementReceiptTable, purchaserejectiondisposition.ReplacementReceiptColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseRejectionDispositionClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseRejectionDisposition
	return append(hooks[:len(hooks):len(hooks)], purchaserejectiondisposition.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseRejectionDispositionClient) Interceptors() []Interceptor {
	return c.inters.PurchaseRejectionDisposition
}

func (c *PurchaseRejectionDispositionClient) mutate(ctx context.Context, m *PurchaseRejectionDispositionMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseRejectionDispositionCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseRejectionDispositionUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseRejectionDispositionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseRejectionDispositionDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseRejectionDisposition mutation op: %q", m.Op())
	}
}

// PurchaseReturnClient is a client for the PurchaseReturn schema.
type PurchaseReturnClient struct {
	config
}

// NewPurchaseReturnClient returns a client for the PurchaseReturn from the given config.
func NewPurchaseReturnClient(c config) *PurchaseReturnClient {
	return &PurchaseReturnClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchasereturn.Hooks(f(g(h())))`.
func (c *PurchaseReturnClient) Use(hooks ...Hook) {
	c.hooks.PurchaseReturn = append(c.hooks.PurchaseReturn, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchasereturn.Intercept(f(g(h())))`.
func (c *PurchaseReturnClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseReturn = append(c.inters.PurchaseReturn, interceptors...)
}

// Create returns a builder for creating a PurchaseReturn entity.
func (c *PurchaseReturnClient) Create() *PurchaseReturnCreate {
	mutation := newPurchaseReturnMutation(c.config, OpCreate)
	return &PurchaseReturnCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseReturn entities.
func (c *PurchaseReturnClient) CreateBulk(builders ...*PurchaseReturnCreate) *PurchaseReturnCreateBulk {
	return &PurchaseReturnCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseReturnClient) MapCreateBulk(slice any, setFunc func(*PurchaseReturnCreate, int)) *PurchaseReturnCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseReturnCreateBulk{err: fmt.Errorf("calling to PurchaseReturnClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseReturnCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseReturnCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseReturn.
func (c *PurchaseReturnClient) Update() *PurchaseReturnUpdate {
	mutation := newPurchaseReturnMutation(c.config, OpUpdate)
	return &PurchaseReturnUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseReturnClient) UpdateOne(_m *PurchaseReturn) *PurchaseReturnUpdateOne {
	mutation := newPurchaseReturnMutation(c.config, OpUpdateOne, withPurchaseReturn(_m))
	return &PurchaseReturnUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseReturnClient) UpdateOneID(id int) *PurchaseReturnUpdateOne {
	mutation := newPurchaseReturnMutation(c.config, OpUpdateOne, withPurchaseReturnID(id))
	return &PurchaseReturnUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseReturn.
func (c *PurchaseReturnClient) Delete() *PurchaseReturnDelete {
	mutation := newPurchaseReturnMutation(c.config, OpDelete)
	return &PurchaseReturnDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseReturnClient) DeleteOne(_m *PurchaseReturn) *PurchaseReturnDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseReturnClient) DeleteOneID(id int) *PurchaseReturnDeleteOne {
	builder := c.Delete().Where(purchasereturn.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseReturnDeleteOne{builder}
}

// Query returns a query builder for PurchaseReturn.
func (c *PurchaseReturnClient) Query() *PurchaseReturnQuery {
	return &PurchaseReturnQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseReturn},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseReturn entity by its id.
func (c *PurchaseReturnClient) Get(ctx context.Context, id int) (*PurchaseReturn, error) {
	return c.Query().Where(purchasereturn.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseReturnClient) GetX(ctx context.Context, id int) *PurchaseReturn {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryPurchaseReceipt queries the purchase_receipt edge of a PurchaseReturn.
func (c *PurchaseReturnClient) QueryPurchaseReceipt(_m *PurchaseReturn) *PurchaseReceiptQuery {
	query := (&PurchaseReceiptClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturn.Table, purchasereturn.FieldID, id),
			sqlgraph.To(purchasereceipt.Table, purchasereceipt.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturn.PurchaseReceiptTable, purchasereturn.PurchaseReceiptColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryQualityInspection queries the quality_inspection edge of a PurchaseReturn.
func (c *PurchaseReturnClient) QueryQualityInspection(_m *PurchaseReturn) *QualityInspectionQuery {
	query := (&QualityInspectionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturn.Table, purchasereturn.FieldID, id),
			sqlgraph.To(qualityinspection.Table, qualityinspection.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturn.QualityInspectionTable, purchasereturn.QualityInspectionColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryItems queries the items edge of a PurchaseReturn.
func (c *PurchaseReturnClient) QueryItems(_m *PurchaseReturn) *PurchaseReturnItemQuery {
	query := (&PurchaseReturnItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturn.Table, purchasereturn.FieldID, id),
			sqlgraph.To(purchasereturnitem.Table, purchasereturnitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, purchasereturn.ItemsTable, purchasereturn.ItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseReturnClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseReturn
	return append(hooks[:len(hooks):len(hooks)], purchasereturn.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseReturnClient) Interceptors() []Interceptor {
	return c.inters.PurchaseReturn
}

func (c *PurchaseReturnClient) mutate(ctx context.Context, m *PurchaseReturnMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseReturnCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseReturnUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseReturnUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseReturnDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseReturn mutation op: %q", m.Op())
	}
}

// PurchaseReturnItemClient is a client for the PurchaseReturnItem schema.
type PurchaseReturnItemClient struct {
	config
}

// NewPurchaseReturnItemClient returns a client for the PurchaseReturnItem from the given config.
func NewPurchaseReturnItemClient(c config) *PurchaseReturnItemClient {
	return &PurchaseReturnItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `purchasereturnitem.Hooks(f(g(h())))`.
func (c *PurchaseReturnItemClient) Use(hooks ...Hook) {
	c.hooks.PurchaseReturnItem = append(c.hooks.PurchaseReturnItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `purchasereturnitem.Intercept(f(g(h())))`.
func (c *PurchaseReturnItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.PurchaseReturnItem = append(c.inters.PurchaseReturnItem, interceptors...)
}

// Create returns a builder for creating a PurchaseReturnItem entity.
func (c *PurchaseReturnItemClient) Create() *PurchaseReturnItemCreate {
	mutation := newPurchaseReturnItemMutation(c.config, OpCreate)
	return &PurchaseReturnItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of PurchaseReturnItem entities.
func (c *PurchaseReturnItemClient) CreateBulk(builders ...*PurchaseReturnItemCreate) *PurchaseReturnItemCreateBulk {
	return &PurchaseReturnItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *PurchaseReturnItemClient) MapCreateBulk(slice any, setFunc func(*PurchaseReturnItemCreate, int)) *PurchaseReturnItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &PurchaseReturnItemCreateBulk{err: fmt.Errorf("calling to PurchaseReturnItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*PurchaseReturnItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &PurchaseReturnItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for PurchaseReturnItem.
func (c *PurchaseReturnItemClient) Update() *PurchaseReturnItemUpdate {
	mutation := newPurchaseReturnItemMutation(c.config, OpUpdate)
	return &PurchaseReturnItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *PurchaseReturnItemClient) UpdateOne(_m *PurchaseReturnItem) *PurchaseReturnItemUpdateOne {
	mutation := newPurchaseReturnItemMutation(c.config, OpUpdateOne, withPurchaseReturnItem(_m))
	return &PurchaseReturnItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *PurchaseReturnItemClient) UpdateOneID(id int) *PurchaseReturnItemUpdateOne {
	mutation := newPurchaseReturnItemMutation(c.config, OpUpdateOne, withPurchaseReturnItemID(id))
	return &PurchaseReturnItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for PurchaseReturnItem.
func (c *PurchaseReturnItemClient) Delete() *PurchaseReturnItemDelete {
	mutation := newPurchaseReturnItemMutation(c.config, OpDelete)
	return &PurchaseReturnItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *PurchaseReturnItemClient) DeleteOne(_m *PurchaseReturnItem) *PurchaseReturnItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *PurchaseReturnItemClient) DeleteOneID(id int) *PurchaseReturnItemDeleteOne {
	builder := c.Delete().Where(purchasereturnitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &PurchaseReturnItemDeleteOne{builder}
}

// Query returns a query builder for PurchaseReturnItem.
func (c *PurchaseReturnItemClient) Query() *PurchaseReturnItemQuery {
	return &PurchaseReturnItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypePurchaseReturnItem},
		inters: c.Interceptors(),
	}
}

// Get returns a PurchaseReturnItem entity by its id.
func (c *PurchaseReturnItemClient) Get(ctx context.Context, id int) (*PurchaseReturnItem, error) {
	return c.Query().Where(purchasereturnitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *PurchaseReturnItemClient) GetX(ctx context.Context, id int) *PurchaseReturnItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryPurchaseReturn queries the purchase_return edge of a PurchaseReturnItem.
func (c *PurchaseReturnItemClient) QueryPurchaseReturn(_m *PurchaseReturnItem) *PurchaseReturnQuery {
	query := (&PurchaseReturnClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturnitem.Table, purchasereturnitem.FieldID, id),
			sqlgraph.To(purchasereturn.Table, purchasereturn.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturnitem.PurchaseReturnTable, purchasereturnitem.PurchaseReturnColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptItem queries the purchase_receipt_item edge of a PurchaseReturnItem.
func (c *PurchaseReturnItemClient) QueryPurchaseReceiptItem(_m *PurchaseReturnItem) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturnitem.Table, purchasereturnitem.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturnitem.PurchaseReceiptItemTable, purchasereturnitem.PurchaseReceiptItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterial queries the material edge of a PurchaseReturnItem.
func (c *PurchaseReturnItemClient) QueryMaterial(_m *PurchaseReturnItem) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturnitem.Table, purchasereturnitem.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturnitem.MaterialTable, purchasereturnitem.MaterialColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWarehouse queries the warehouse edge of a PurchaseReturnItem.
func (c *PurchaseReturnItemClient) QueryWarehouse(_m *PurchaseReturnItem) *WarehouseQuery {
	query := (&WarehouseClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturnitem.Table, purchasereturnitem.FieldID, id),
			sqlgraph.To(warehouse.Table, warehouse.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturnitem.WarehouseTable, purchasereturnitem.WarehouseColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a PurchaseReturnItem.
func (c *PurchaseReturnItemClient) QueryUnit(_m *PurchaseReturnItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturnitem.Table, purchasereturnitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturnitem.UnitTable, purchasereturnitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryLot queries the inventory_lot edge of a PurchaseReturnItem.
func (c *PurchaseReturnItemClient) QueryInventoryLot(_m *PurchaseReturnItem) *InventoryLotQuery {
	query := (&InventoryLotClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(purchasereturnitem.Table, purchasereturnitem.FieldID, id),
			sqlgraph.To(inventorylot.Table, inventorylot.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, purchasereturnitem.InventoryLotTable, purchasereturnitem.InventoryLotColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *PurchaseReturnItemClient) Hooks() []Hook {
	hooks := c.hooks.PurchaseReturnItem
	return append(hooks[:len(hooks):len(hooks)], purchasereturnitem.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *PurchaseReturnItemClient) Interceptors() []Interceptor {
	return c.inters.PurchaseReturnItem
}

func (c *PurchaseReturnItemClient) mutate(ctx context.Context, m *PurchaseReturnItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&PurchaseReturnItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&PurchaseReturnItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&PurchaseReturnItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&PurchaseReturnItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown PurchaseReturnItem mutation op: %q", m.Op())
	}
}

// QualityInspectionClient is a client for the QualityInspection schema.
type QualityInspectionClient struct {
	config
}

// NewQualityInspectionClient returns a client for the QualityInspection from the given config.
func NewQualityInspectionClient(c config) *QualityInspectionClient {
	return &QualityInspectionClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `qualityinspection.Hooks(f(g(h())))`.
func (c *QualityInspectionClient) Use(hooks ...Hook) {
	c.hooks.QualityInspection = append(c.hooks.QualityInspection, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `qualityinspection.Intercept(f(g(h())))`.
func (c *QualityInspectionClient) Intercept(interceptors ...Interceptor) {
	c.inters.QualityInspection = append(c.inters.QualityInspection, interceptors...)
}

// Create returns a builder for creating a QualityInspection entity.
func (c *QualityInspectionClient) Create() *QualityInspectionCreate {
	mutation := newQualityInspectionMutation(c.config, OpCreate)
	return &QualityInspectionCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of QualityInspection entities.
func (c *QualityInspectionClient) CreateBulk(builders ...*QualityInspectionCreate) *QualityInspectionCreateBulk {
	return &QualityInspectionCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *QualityInspectionClient) MapCreateBulk(slice any, setFunc func(*QualityInspectionCreate, int)) *QualityInspectionCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &QualityInspectionCreateBulk{err: fmt.Errorf("calling to QualityInspectionClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*QualityInspectionCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &QualityInspectionCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for QualityInspection.
func (c *QualityInspectionClient) Update() *QualityInspectionUpdate {
	mutation := newQualityInspectionMutation(c.config, OpUpdate)
	return &QualityInspectionUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *QualityInspectionClient) UpdateOne(_m *QualityInspection) *QualityInspectionUpdateOne {
	mutation := newQualityInspectionMutation(c.config, OpUpdateOne, withQualityInspection(_m))
	return &QualityInspectionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *QualityInspectionClient) UpdateOneID(id int) *QualityInspectionUpdateOne {
	mutation := newQualityInspectionMutation(c.config, OpUpdateOne, withQualityInspectionID(id))
	return &QualityInspectionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for QualityInspection.
func (c *QualityInspectionClient) Delete() *QualityInspectionDelete {
	mutation := newQualityInspectionMutation(c.config, OpDelete)
	return &QualityInspectionDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *QualityInspectionClient) DeleteOne(_m *QualityInspection) *QualityInspectionDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *QualityInspectionClient) DeleteOneID(id int) *QualityInspectionDeleteOne {
	builder := c.Delete().Where(qualityinspection.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &QualityInspectionDeleteOne{builder}
}

// Query returns a query builder for QualityInspection.
func (c *QualityInspectionClient) Query() *QualityInspectionQuery {
	return &QualityInspectionQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeQualityInspection},
		inters: c.Interceptors(),
	}
}

// Get returns a QualityInspection entity by its id.
func (c *QualityInspectionClient) Get(ctx context.Context, id int) (*QualityInspection, error) {
	return c.Query().Where(qualityinspection.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *QualityInspectionClient) GetX(ctx context.Context, id int) *QualityInspection {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryInventoryLotStatusEvents queries the inventory_lot_status_events edge of a QualityInspection.
func (c *QualityInspectionClient) QueryInventoryLotStatusEvents(_m *QualityInspection) *InventoryLotStatusEventQuery {
	query := (&InventoryLotStatusEventClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(inventorylotstatusevent.Table, inventorylotstatusevent.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, qualityinspection.InventoryLotStatusEventsTable, qualityinspection.InventoryLotStatusEventsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceipt queries the purchase_receipt edge of a QualityInspection.
func (c *QualityInspectionClient) QueryPurchaseReceipt(_m *QualityInspection) *PurchaseReceiptQuery {
	query := (&PurchaseReceiptClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(purchasereceipt.Table, purchasereceipt.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, qualityinspection.PurchaseReceiptTable, qualityinspection.PurchaseReceiptColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptItem queries the purchase_receipt_item edge of a QualityInspection.
func (c *QualityInspectionClient) QueryPurchaseReceiptItem(_m *QualityInspection) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, qualityinspection.PurchaseReceiptItemTable, qualityinspection.PurchaseReceiptItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryLot queries the inventory_lot edge of a QualityInspection.
func (c *QualityInspectionClient) QueryInventoryLot(_m *QualityInspection) *InventoryLotQuery {
	query := (&InventoryLotClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(inventorylot.Table, inventorylot.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, qualityinspection.InventoryLotTable, qualityinspection.InventoryLotColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionWipBatch queries the production_wip_batch edge of a QualityInspection.
func (c *QualityInspectionClient) QueryProductionWipBatch(_m *QualityInspection) *ProductionWIPBatchQuery {
	query := (&ProductionWIPBatchClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(productionwipbatch.Table, productionwipbatch.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, qualityinspection.ProductionWipBatchTable, qualityinspection.ProductionWipBatchColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryMaterial queries the material edge of a QualityInspection.
func (c *QualityInspectionClient) QueryMaterial(_m *QualityInspection) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, qualityinspection.MaterialTable, qualityinspection.MaterialColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWarehouse queries the warehouse edge of a QualityInspection.
func (c *QualityInspectionClient) QueryWarehouse(_m *QualityInspection) *WarehouseQuery {
	query := (&WarehouseClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(warehouse.Table, warehouse.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, qualityinspection.WarehouseTable, qualityinspection.WarehouseColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReturns queries the purchase_returns edge of a QualityInspection.
func (c *QualityInspectionClient) QueryPurchaseReturns(_m *QualityInspection) *PurchaseReturnQuery {
	query := (&PurchaseReturnClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(qualityinspection.Table, qualityinspection.FieldID, id),
			sqlgraph.To(purchasereturn.Table, purchasereturn.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, qualityinspection.PurchaseReturnsTable, qualityinspection.PurchaseReturnsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *QualityInspectionClient) Hooks() []Hook {
	hooks := c.hooks.QualityInspection
	return append(hooks[:len(hooks):len(hooks)], qualityinspection.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *QualityInspectionClient) Interceptors() []Interceptor {
	return c.inters.QualityInspection
}

func (c *QualityInspectionClient) mutate(ctx context.Context, m *QualityInspectionMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&QualityInspectionCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&QualityInspectionUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&QualityInspectionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&QualityInspectionDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown QualityInspection mutation op: %q", m.Op())
	}
}

// RoleClient is a client for the Role schema.
type RoleClient struct {
	config
}

// NewRoleClient returns a client for the Role from the given config.
func NewRoleClient(c config) *RoleClient {
	return &RoleClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `role.Hooks(f(g(h())))`.
func (c *RoleClient) Use(hooks ...Hook) {
	c.hooks.Role = append(c.hooks.Role, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `role.Intercept(f(g(h())))`.
func (c *RoleClient) Intercept(interceptors ...Interceptor) {
	c.inters.Role = append(c.inters.Role, interceptors...)
}

// Create returns a builder for creating a Role entity.
func (c *RoleClient) Create() *RoleCreate {
	mutation := newRoleMutation(c.config, OpCreate)
	return &RoleCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of Role entities.
func (c *RoleClient) CreateBulk(builders ...*RoleCreate) *RoleCreateBulk {
	return &RoleCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *RoleClient) MapCreateBulk(slice any, setFunc func(*RoleCreate, int)) *RoleCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &RoleCreateBulk{err: fmt.Errorf("calling to RoleClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*RoleCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &RoleCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for Role.
func (c *RoleClient) Update() *RoleUpdate {
	mutation := newRoleMutation(c.config, OpUpdate)
	return &RoleUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *RoleClient) UpdateOne(_m *Role) *RoleUpdateOne {
	mutation := newRoleMutation(c.config, OpUpdateOne, withRole(_m))
	return &RoleUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *RoleClient) UpdateOneID(id int) *RoleUpdateOne {
	mutation := newRoleMutation(c.config, OpUpdateOne, withRoleID(id))
	return &RoleUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for Role.
func (c *RoleClient) Delete() *RoleDelete {
	mutation := newRoleMutation(c.config, OpDelete)
	return &RoleDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *RoleClient) DeleteOne(_m *Role) *RoleDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *RoleClient) DeleteOneID(id int) *RoleDeleteOne {
	builder := c.Delete().Where(role.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &RoleDeleteOne{builder}
}

// Query returns a query builder for Role.
func (c *RoleClient) Query() *RoleQuery {
	return &RoleQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeRole},
		inters: c.Interceptors(),
	}
}

// Get returns a Role entity by its id.
func (c *RoleClient) Get(ctx context.Context, id int) (*Role, error) {
	return c.Query().Where(role.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *RoleClient) GetX(ctx context.Context, id int) *Role {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryDataScopes queries the data_scopes edge of a Role.
func (c *RoleClient) QueryDataScopes(_m *Role) *RoleDataScopeQuery {
	query := (&RoleDataScopeClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(role.Table, role.FieldID, id),
			sqlgraph.To(roledatascope.Table, roledatascope.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, role.DataScopesTable, role.DataScopesColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *RoleClient) Hooks() []Hook {
	return c.hooks.Role
}

// Interceptors returns the client interceptors.
func (c *RoleClient) Interceptors() []Interceptor {
	return c.inters.Role
}

func (c *RoleClient) mutate(ctx context.Context, m *RoleMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&RoleCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&RoleUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&RoleUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&RoleDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown Role mutation op: %q", m.Op())
	}
}

// RoleDataScopeClient is a client for the RoleDataScope schema.
type RoleDataScopeClient struct {
	config
}

// NewRoleDataScopeClient returns a client for the RoleDataScope from the given config.
func NewRoleDataScopeClient(c config) *RoleDataScopeClient {
	return &RoleDataScopeClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `roledatascope.Hooks(f(g(h())))`.
func (c *RoleDataScopeClient) Use(hooks ...Hook) {
	c.hooks.RoleDataScope = append(c.hooks.RoleDataScope, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `roledatascope.Intercept(f(g(h())))`.
func (c *RoleDataScopeClient) Intercept(interceptors ...Interceptor) {
	c.inters.RoleDataScope = append(c.inters.RoleDataScope, interceptors...)
}

// Create returns a builder for creating a RoleDataScope entity.
func (c *RoleDataScopeClient) Create() *RoleDataScopeCreate {
	mutation := newRoleDataScopeMutation(c.config, OpCreate)
	return &RoleDataScopeCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of RoleDataScope entities.
func (c *RoleDataScopeClient) CreateBulk(builders ...*RoleDataScopeCreate) *RoleDataScopeCreateBulk {
	return &RoleDataScopeCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *RoleDataScopeClient) MapCreateBulk(slice any, setFunc func(*RoleDataScopeCreate, int)) *RoleDataScopeCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &RoleDataScopeCreateBulk{err: fmt.Errorf("calling to RoleDataScopeClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*RoleDataScopeCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &RoleDataScopeCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for RoleDataScope.
func (c *RoleDataScopeClient) Update() *RoleDataScopeUpdate {
	mutation := newRoleDataScopeMutation(c.config, OpUpdate)
	return &RoleDataScopeUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *RoleDataScopeClient) UpdateOne(_m *RoleDataScope) *RoleDataScopeUpdateOne {
	mutation := newRoleDataScopeMutation(c.config, OpUpdateOne, withRoleDataScope(_m))
	return &RoleDataScopeUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *RoleDataScopeClient) UpdateOneID(id int) *RoleDataScopeUpdateOne {
	mutation := newRoleDataScopeMutation(c.config, OpUpdateOne, withRoleDataScopeID(id))
	return &RoleDataScopeUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for RoleDataScope.
func (c *RoleDataScopeClient) Delete() *RoleDataScopeDelete {
	mutation := newRoleDataScopeMutation(c.config, OpDelete)
	return &RoleDataScopeDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *RoleDataScopeClient) DeleteOne(_m *RoleDataScope) *RoleDataScopeDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *RoleDataScopeClient) DeleteOneID(id int) *RoleDataScopeDeleteOne {
	builder := c.Delete().Where(roledatascope.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &RoleDataScopeDeleteOne{builder}
}

// Query returns a query builder for RoleDataScope.
func (c *RoleDataScopeClient) Query() *RoleDataScopeQuery {
	return &RoleDataScopeQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeRoleDataScope},
		inters: c.Interceptors(),
	}
}

// Get returns a RoleDataScope entity by its id.
func (c *RoleDataScopeClient) Get(ctx context.Context, id int) (*RoleDataScope, error) {
	return c.Query().Where(roledatascope.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *RoleDataScopeClient) GetX(ctx context.Context, id int) *RoleDataScope {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryRole queries the role edge of a RoleDataScope.
func (c *RoleDataScopeClient) QueryRole(_m *RoleDataScope) *RoleQuery {
	query := (&RoleClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(roledatascope.Table, roledatascope.FieldID, id),
			sqlgraph.To(role.Table, role.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, roledatascope.RoleTable, roledatascope.RoleColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *RoleDataScopeClient) Hooks() []Hook {
	return c.hooks.RoleDataScope
}

// Interceptors returns the client interceptors.
func (c *RoleDataScopeClient) Interceptors() []Interceptor {
	return c.inters.RoleDataScope
}

func (c *RoleDataScopeClient) mutate(ctx context.Context, m *RoleDataScopeMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&RoleDataScopeCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&RoleDataScopeUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&RoleDataScopeUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&RoleDataScopeDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown RoleDataScope mutation op: %q", m.Op())
	}
}

// RolePermissionClient is a client for the RolePermission schema.
type RolePermissionClient struct {
	config
}

// NewRolePermissionClient returns a client for the RolePermission from the given config.
func NewRolePermissionClient(c config) *RolePermissionClient {
	return &RolePermissionClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `rolepermission.Hooks(f(g(h())))`.
func (c *RolePermissionClient) Use(hooks ...Hook) {
	c.hooks.RolePermission = append(c.hooks.RolePermission, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `rolepermission.Intercept(f(g(h())))`.
func (c *RolePermissionClient) Intercept(interceptors ...Interceptor) {
	c.inters.RolePermission = append(c.inters.RolePermission, interceptors...)
}

// Create returns a builder for creating a RolePermission entity.
func (c *RolePermissionClient) Create() *RolePermissionCreate {
	mutation := newRolePermissionMutation(c.config, OpCreate)
	return &RolePermissionCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of RolePermission entities.
func (c *RolePermissionClient) CreateBulk(builders ...*RolePermissionCreate) *RolePermissionCreateBulk {
	return &RolePermissionCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *RolePermissionClient) MapCreateBulk(slice any, setFunc func(*RolePermissionCreate, int)) *RolePermissionCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &RolePermissionCreateBulk{err: fmt.Errorf("calling to RolePermissionClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*RolePermissionCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &RolePermissionCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for RolePermission.
func (c *RolePermissionClient) Update() *RolePermissionUpdate {
	mutation := newRolePermissionMutation(c.config, OpUpdate)
	return &RolePermissionUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *RolePermissionClient) UpdateOne(_m *RolePermission) *RolePermissionUpdateOne {
	mutation := newRolePermissionMutation(c.config, OpUpdateOne, withRolePermission(_m))
	return &RolePermissionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *RolePermissionClient) UpdateOneID(id int) *RolePermissionUpdateOne {
	mutation := newRolePermissionMutation(c.config, OpUpdateOne, withRolePermissionID(id))
	return &RolePermissionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for RolePermission.
func (c *RolePermissionClient) Delete() *RolePermissionDelete {
	mutation := newRolePermissionMutation(c.config, OpDelete)
	return &RolePermissionDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *RolePermissionClient) DeleteOne(_m *RolePermission) *RolePermissionDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *RolePermissionClient) DeleteOneID(id int) *RolePermissionDeleteOne {
	builder := c.Delete().Where(rolepermission.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &RolePermissionDeleteOne{builder}
}

// Query returns a query builder for RolePermission.
func (c *RolePermissionClient) Query() *RolePermissionQuery {
	return &RolePermissionQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeRolePermission},
		inters: c.Interceptors(),
	}
}

// Get returns a RolePermission entity by its id.
func (c *RolePermissionClient) Get(ctx context.Context, id int) (*RolePermission, error) {
	return c.Query().Where(rolepermission.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *RolePermissionClient) GetX(ctx context.Context, id int) *RolePermission {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *RolePermissionClient) Hooks() []Hook {
	return c.hooks.RolePermission
}

// Interceptors returns the client interceptors.
func (c *RolePermissionClient) Interceptors() []Interceptor {
	return c.inters.RolePermission
}

func (c *RolePermissionClient) mutate(ctx context.Context, m *RolePermissionMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&RolePermissionCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&RolePermissionUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&RolePermissionUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&RolePermissionDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown RolePermission mutation op: %q", m.Op())
	}
}

// RoleProfileClient is a client for the RoleProfile schema.
type RoleProfileClient struct {
	config
}

// NewRoleProfileClient returns a client for the RoleProfile from the given config.
func NewRoleProfileClient(c config) *RoleProfileClient {
	return &RoleProfileClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `roleprofile.Hooks(f(g(h())))`.
func (c *RoleProfileClient) Use(hooks ...Hook) {
	c.hooks.RoleProfile = append(c.hooks.RoleProfile, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `roleprofile.Intercept(f(g(h())))`.
func (c *RoleProfileClient) Intercept(interceptors ...Interceptor) {
	c.inters.RoleProfile = append(c.inters.RoleProfile, interceptors...)
}

// Create returns a builder for creating a RoleProfile entity.
func (c *RoleProfileClient) Create() *RoleProfileCreate {
	mutation := newRoleProfileMutation(c.config, OpCreate)
	return &RoleProfileCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of RoleProfile entities.
func (c *RoleProfileClient) CreateBulk(builders ...*RoleProfileCreate) *RoleProfileCreateBulk {
	return &RoleProfileCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *RoleProfileClient) MapCreateBulk(slice any, setFunc func(*RoleProfileCreate, int)) *RoleProfileCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &RoleProfileCreateBulk{err: fmt.Errorf("calling to RoleProfileClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*RoleProfileCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &RoleProfileCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for RoleProfile.
func (c *RoleProfileClient) Update() *RoleProfileUpdate {
	mutation := newRoleProfileMutation(c.config, OpUpdate)
	return &RoleProfileUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *RoleProfileClient) UpdateOne(_m *RoleProfile) *RoleProfileUpdateOne {
	mutation := newRoleProfileMutation(c.config, OpUpdateOne, withRoleProfile(_m))
	return &RoleProfileUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *RoleProfileClient) UpdateOneID(id int) *RoleProfileUpdateOne {
	mutation := newRoleProfileMutation(c.config, OpUpdateOne, withRoleProfileID(id))
	return &RoleProfileUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for RoleProfile.
func (c *RoleProfileClient) Delete() *RoleProfileDelete {
	mutation := newRoleProfileMutation(c.config, OpDelete)
	return &RoleProfileDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *RoleProfileClient) DeleteOne(_m *RoleProfile) *RoleProfileDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *RoleProfileClient) DeleteOneID(id int) *RoleProfileDeleteOne {
	builder := c.Delete().Where(roleprofile.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &RoleProfileDeleteOne{builder}
}

// Query returns a query builder for RoleProfile.
func (c *RoleProfileClient) Query() *RoleProfileQuery {
	return &RoleProfileQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeRoleProfile},
		inters: c.Interceptors(),
	}
}

// Get returns a RoleProfile entity by its id.
func (c *RoleProfileClient) Get(ctx context.Context, id int) (*RoleProfile, error) {
	return c.Query().Where(roleprofile.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *RoleProfileClient) GetX(ctx context.Context, id int) *RoleProfile {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *RoleProfileClient) Hooks() []Hook {
	return c.hooks.RoleProfile
}

// Interceptors returns the client interceptors.
func (c *RoleProfileClient) Interceptors() []Interceptor {
	return c.inters.RoleProfile
}

func (c *RoleProfileClient) mutate(ctx context.Context, m *RoleProfileMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&RoleProfileCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&RoleProfileUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&RoleProfileUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&RoleProfileDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown RoleProfile mutation op: %q", m.Op())
	}
}

// RuntimeAuditEventClient is a client for the RuntimeAuditEvent schema.
type RuntimeAuditEventClient struct {
	config
}

// NewRuntimeAuditEventClient returns a client for the RuntimeAuditEvent from the given config.
func NewRuntimeAuditEventClient(c config) *RuntimeAuditEventClient {
	return &RuntimeAuditEventClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `runtimeauditevent.Hooks(f(g(h())))`.
func (c *RuntimeAuditEventClient) Use(hooks ...Hook) {
	c.hooks.RuntimeAuditEvent = append(c.hooks.RuntimeAuditEvent, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `runtimeauditevent.Intercept(f(g(h())))`.
func (c *RuntimeAuditEventClient) Intercept(interceptors ...Interceptor) {
	c.inters.RuntimeAuditEvent = append(c.inters.RuntimeAuditEvent, interceptors...)
}

// Create returns a builder for creating a RuntimeAuditEvent entity.
func (c *RuntimeAuditEventClient) Create() *RuntimeAuditEventCreate {
	mutation := newRuntimeAuditEventMutation(c.config, OpCreate)
	return &RuntimeAuditEventCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of RuntimeAuditEvent entities.
func (c *RuntimeAuditEventClient) CreateBulk(builders ...*RuntimeAuditEventCreate) *RuntimeAuditEventCreateBulk {
	return &RuntimeAuditEventCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *RuntimeAuditEventClient) MapCreateBulk(slice any, setFunc func(*RuntimeAuditEventCreate, int)) *RuntimeAuditEventCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &RuntimeAuditEventCreateBulk{err: fmt.Errorf("calling to RuntimeAuditEventClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*RuntimeAuditEventCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &RuntimeAuditEventCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for RuntimeAuditEvent.
func (c *RuntimeAuditEventClient) Update() *RuntimeAuditEventUpdate {
	mutation := newRuntimeAuditEventMutation(c.config, OpUpdate)
	return &RuntimeAuditEventUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *RuntimeAuditEventClient) UpdateOne(_m *RuntimeAuditEvent) *RuntimeAuditEventUpdateOne {
	mutation := newRuntimeAuditEventMutation(c.config, OpUpdateOne, withRuntimeAuditEvent(_m))
	return &RuntimeAuditEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *RuntimeAuditEventClient) UpdateOneID(id int) *RuntimeAuditEventUpdateOne {
	mutation := newRuntimeAuditEventMutation(c.config, OpUpdateOne, withRuntimeAuditEventID(id))
	return &RuntimeAuditEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for RuntimeAuditEvent.
func (c *RuntimeAuditEventClient) Delete() *RuntimeAuditEventDelete {
	mutation := newRuntimeAuditEventMutation(c.config, OpDelete)
	return &RuntimeAuditEventDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *RuntimeAuditEventClient) DeleteOne(_m *RuntimeAuditEvent) *RuntimeAuditEventDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *RuntimeAuditEventClient) DeleteOneID(id int) *RuntimeAuditEventDeleteOne {
	builder := c.Delete().Where(runtimeauditevent.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &RuntimeAuditEventDeleteOne{builder}
}

// Query returns a query builder for RuntimeAuditEvent.
func (c *RuntimeAuditEventClient) Query() *RuntimeAuditEventQuery {
	return &RuntimeAuditEventQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeRuntimeAuditEvent},
		inters: c.Interceptors(),
	}
}

// Get returns a RuntimeAuditEvent entity by its id.
func (c *RuntimeAuditEventClient) Get(ctx context.Context, id int) (*RuntimeAuditEvent, error) {
	return c.Query().Where(runtimeauditevent.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *RuntimeAuditEventClient) GetX(ctx context.Context, id int) *RuntimeAuditEvent {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *RuntimeAuditEventClient) Hooks() []Hook {
	hooks := c.hooks.RuntimeAuditEvent
	return append(hooks[:len(hooks):len(hooks)], runtimeauditevent.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *RuntimeAuditEventClient) Interceptors() []Interceptor {
	return c.inters.RuntimeAuditEvent
}

func (c *RuntimeAuditEventClient) mutate(ctx context.Context, m *RuntimeAuditEventMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&RuntimeAuditEventCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&RuntimeAuditEventUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&RuntimeAuditEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&RuntimeAuditEventDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown RuntimeAuditEvent mutation op: %q", m.Op())
	}
}

// RuntimeMarkerClient is a client for the RuntimeMarker schema.
type RuntimeMarkerClient struct {
	config
}

// NewRuntimeMarkerClient returns a client for the RuntimeMarker from the given config.
func NewRuntimeMarkerClient(c config) *RuntimeMarkerClient {
	return &RuntimeMarkerClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `runtimemarker.Hooks(f(g(h())))`.
func (c *RuntimeMarkerClient) Use(hooks ...Hook) {
	c.hooks.RuntimeMarker = append(c.hooks.RuntimeMarker, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `runtimemarker.Intercept(f(g(h())))`.
func (c *RuntimeMarkerClient) Intercept(interceptors ...Interceptor) {
	c.inters.RuntimeMarker = append(c.inters.RuntimeMarker, interceptors...)
}

// Create returns a builder for creating a RuntimeMarker entity.
func (c *RuntimeMarkerClient) Create() *RuntimeMarkerCreate {
	mutation := newRuntimeMarkerMutation(c.config, OpCreate)
	return &RuntimeMarkerCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of RuntimeMarker entities.
func (c *RuntimeMarkerClient) CreateBulk(builders ...*RuntimeMarkerCreate) *RuntimeMarkerCreateBulk {
	return &RuntimeMarkerCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *RuntimeMarkerClient) MapCreateBulk(slice any, setFunc func(*RuntimeMarkerCreate, int)) *RuntimeMarkerCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &RuntimeMarkerCreateBulk{err: fmt.Errorf("calling to RuntimeMarkerClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*RuntimeMarkerCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &RuntimeMarkerCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for RuntimeMarker.
func (c *RuntimeMarkerClient) Update() *RuntimeMarkerUpdate {
	mutation := newRuntimeMarkerMutation(c.config, OpUpdate)
	return &RuntimeMarkerUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *RuntimeMarkerClient) UpdateOne(_m *RuntimeMarker) *RuntimeMarkerUpdateOne {
	mutation := newRuntimeMarkerMutation(c.config, OpUpdateOne, withRuntimeMarker(_m))
	return &RuntimeMarkerUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *RuntimeMarkerClient) UpdateOneID(id int) *RuntimeMarkerUpdateOne {
	mutation := newRuntimeMarkerMutation(c.config, OpUpdateOne, withRuntimeMarkerID(id))
	return &RuntimeMarkerUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for RuntimeMarker.
func (c *RuntimeMarkerClient) Delete() *RuntimeMarkerDelete {
	mutation := newRuntimeMarkerMutation(c.config, OpDelete)
	return &RuntimeMarkerDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *RuntimeMarkerClient) DeleteOne(_m *RuntimeMarker) *RuntimeMarkerDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *RuntimeMarkerClient) DeleteOneID(id int) *RuntimeMarkerDeleteOne {
	builder := c.Delete().Where(runtimemarker.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &RuntimeMarkerDeleteOne{builder}
}

// Query returns a query builder for RuntimeMarker.
func (c *RuntimeMarkerClient) Query() *RuntimeMarkerQuery {
	return &RuntimeMarkerQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeRuntimeMarker},
		inters: c.Interceptors(),
	}
}

// Get returns a RuntimeMarker entity by its id.
func (c *RuntimeMarkerClient) Get(ctx context.Context, id int) (*RuntimeMarker, error) {
	return c.Query().Where(runtimemarker.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *RuntimeMarkerClient) GetX(ctx context.Context, id int) *RuntimeMarker {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *RuntimeMarkerClient) Hooks() []Hook {
	hooks := c.hooks.RuntimeMarker
	return append(hooks[:len(hooks):len(hooks)], runtimemarker.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *RuntimeMarkerClient) Interceptors() []Interceptor {
	return c.inters.RuntimeMarker
}

func (c *RuntimeMarkerClient) mutate(ctx context.Context, m *RuntimeMarkerMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&RuntimeMarkerCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&RuntimeMarkerUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&RuntimeMarkerUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&RuntimeMarkerDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown RuntimeMarker mutation op: %q", m.Op())
	}
}

// SalesOrderClient is a client for the SalesOrder schema.
type SalesOrderClient struct {
	config
}

// NewSalesOrderClient returns a client for the SalesOrder from the given config.
func NewSalesOrderClient(c config) *SalesOrderClient {
	return &SalesOrderClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `salesorder.Hooks(f(g(h())))`.
func (c *SalesOrderClient) Use(hooks ...Hook) {
	c.hooks.SalesOrder = append(c.hooks.SalesOrder, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `salesorder.Intercept(f(g(h())))`.
func (c *SalesOrderClient) Intercept(interceptors ...Interceptor) {
	c.inters.SalesOrder = append(c.inters.SalesOrder, interceptors...)
}

// Create returns a builder for creating a SalesOrder entity.
func (c *SalesOrderClient) Create() *SalesOrderCreate {
	mutation := newSalesOrderMutation(c.config, OpCreate)
	return &SalesOrderCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of SalesOrder entities.
func (c *SalesOrderClient) CreateBulk(builders ...*SalesOrderCreate) *SalesOrderCreateBulk {
	return &SalesOrderCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *SalesOrderClient) MapCreateBulk(slice any, setFunc func(*SalesOrderCreate, int)) *SalesOrderCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &SalesOrderCreateBulk{err: fmt.Errorf("calling to SalesOrderClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*SalesOrderCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &SalesOrderCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for SalesOrder.
func (c *SalesOrderClient) Update() *SalesOrderUpdate {
	mutation := newSalesOrderMutation(c.config, OpUpdate)
	return &SalesOrderUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *SalesOrderClient) UpdateOne(_m *SalesOrder) *SalesOrderUpdateOne {
	mutation := newSalesOrderMutation(c.config, OpUpdateOne, withSalesOrder(_m))
	return &SalesOrderUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *SalesOrderClient) UpdateOneID(id int) *SalesOrderUpdateOne {
	mutation := newSalesOrderMutation(c.config, OpUpdateOne, withSalesOrderID(id))
	return &SalesOrderUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for SalesOrder.
func (c *SalesOrderClient) Delete() *SalesOrderDelete {
	mutation := newSalesOrderMutation(c.config, OpDelete)
	return &SalesOrderDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *SalesOrderClient) DeleteOne(_m *SalesOrder) *SalesOrderDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *SalesOrderClient) DeleteOneID(id int) *SalesOrderDeleteOne {
	builder := c.Delete().Where(salesorder.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &SalesOrderDeleteOne{builder}
}

// Query returns a query builder for SalesOrder.
func (c *SalesOrderClient) Query() *SalesOrderQuery {
	return &SalesOrderQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeSalesOrder},
		inters: c.Interceptors(),
	}
}

// Get returns a SalesOrder entity by its id.
func (c *SalesOrderClient) Get(ctx context.Context, id int) (*SalesOrder, error) {
	return c.Query().Where(salesorder.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *SalesOrderClient) GetX(ctx context.Context, id int) *SalesOrder {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryCustomer queries the customer edge of a SalesOrder.
func (c *SalesOrderClient) QueryCustomer(_m *SalesOrder) *CustomerQuery {
	query := (&CustomerClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorder.Table, salesorder.FieldID, id),
			sqlgraph.To(customer.Table, customer.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, salesorder.CustomerTable, salesorder.CustomerColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryItems queries the items edge of a SalesOrder.
func (c *SalesOrderClient) QueryItems(_m *SalesOrder) *SalesOrderItemQuery {
	query := (&SalesOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorder.Table, salesorder.FieldID, id),
			sqlgraph.To(salesorderitem.Table, salesorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, salesorder.ItemsTable, salesorder.ItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryShipments queries the shipments edge of a SalesOrder.
func (c *SalesOrderClient) QueryShipments(_m *SalesOrder) *ShipmentQuery {
	query := (&ShipmentClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorder.Table, salesorder.FieldID, id),
			sqlgraph.To(shipment.Table, shipment.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, salesorder.ShipmentsTable, salesorder.ShipmentsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryStockReservations queries the stock_reservations edge of a SalesOrder.
func (c *SalesOrderClient) QueryStockReservations(_m *SalesOrder) *StockReservationQuery {
	query := (&StockReservationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorder.Table, salesorder.FieldID, id),
			sqlgraph.To(stockreservation.Table, stockreservation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, salesorder.StockReservationsTable, salesorder.StockReservationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *SalesOrderClient) Hooks() []Hook {
	return c.hooks.SalesOrder
}

// Interceptors returns the client interceptors.
func (c *SalesOrderClient) Interceptors() []Interceptor {
	return c.inters.SalesOrder
}

func (c *SalesOrderClient) mutate(ctx context.Context, m *SalesOrderMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&SalesOrderCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&SalesOrderUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&SalesOrderUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&SalesOrderDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown SalesOrder mutation op: %q", m.Op())
	}
}

// SalesOrderItemClient is a client for the SalesOrderItem schema.
type SalesOrderItemClient struct {
	config
}

// NewSalesOrderItemClient returns a client for the SalesOrderItem from the given config.
func NewSalesOrderItemClient(c config) *SalesOrderItemClient {
	return &SalesOrderItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `salesorderitem.Hooks(f(g(h())))`.
func (c *SalesOrderItemClient) Use(hooks ...Hook) {
	c.hooks.SalesOrderItem = append(c.hooks.SalesOrderItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `salesorderitem.Intercept(f(g(h())))`.
func (c *SalesOrderItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.SalesOrderItem = append(c.inters.SalesOrderItem, interceptors...)
}

// Create returns a builder for creating a SalesOrderItem entity.
func (c *SalesOrderItemClient) Create() *SalesOrderItemCreate {
	mutation := newSalesOrderItemMutation(c.config, OpCreate)
	return &SalesOrderItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of SalesOrderItem entities.
func (c *SalesOrderItemClient) CreateBulk(builders ...*SalesOrderItemCreate) *SalesOrderItemCreateBulk {
	return &SalesOrderItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *SalesOrderItemClient) MapCreateBulk(slice any, setFunc func(*SalesOrderItemCreate, int)) *SalesOrderItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &SalesOrderItemCreateBulk{err: fmt.Errorf("calling to SalesOrderItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*SalesOrderItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &SalesOrderItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for SalesOrderItem.
func (c *SalesOrderItemClient) Update() *SalesOrderItemUpdate {
	mutation := newSalesOrderItemMutation(c.config, OpUpdate)
	return &SalesOrderItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *SalesOrderItemClient) UpdateOne(_m *SalesOrderItem) *SalesOrderItemUpdateOne {
	mutation := newSalesOrderItemMutation(c.config, OpUpdateOne, withSalesOrderItem(_m))
	return &SalesOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *SalesOrderItemClient) UpdateOneID(id int) *SalesOrderItemUpdateOne {
	mutation := newSalesOrderItemMutation(c.config, OpUpdateOne, withSalesOrderItemID(id))
	return &SalesOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for SalesOrderItem.
func (c *SalesOrderItemClient) Delete() *SalesOrderItemDelete {
	mutation := newSalesOrderItemMutation(c.config, OpDelete)
	return &SalesOrderItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *SalesOrderItemClient) DeleteOne(_m *SalesOrderItem) *SalesOrderItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *SalesOrderItemClient) DeleteOneID(id int) *SalesOrderItemDeleteOne {
	builder := c.Delete().Where(salesorderitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &SalesOrderItemDeleteOne{builder}
}

// Query returns a query builder for SalesOrderItem.
func (c *SalesOrderItemClient) Query() *SalesOrderItemQuery {
	return &SalesOrderItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeSalesOrderItem},
		inters: c.Interceptors(),
	}
}

// Get returns a SalesOrderItem entity by its id.
func (c *SalesOrderItemClient) Get(ctx context.Context, id int) (*SalesOrderItem, error) {
	return c.Query().Where(salesorderitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *SalesOrderItemClient) GetX(ctx context.Context, id int) *SalesOrderItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QuerySalesOrder queries the sales_order edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QuerySalesOrder(_m *SalesOrderItem) *SalesOrderQuery {
	query := (&SalesOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(salesorder.Table, salesorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, salesorderitem.SalesOrderTable, salesorderitem.SalesOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProduct queries the product edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QueryProduct(_m *SalesOrderItem) *ProductQuery {
	query := (&ProductClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(product.Table, product.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, salesorderitem.ProductTable, salesorderitem.ProductColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryBom queries the bom edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QueryBom(_m *SalesOrderItem) *BOMHeaderQuery {
	query := (&BOMHeaderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(bomheader.Table, bomheader.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, salesorderitem.BomTable, salesorderitem.BomColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductSku queries the product_sku edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QueryProductSku(_m *SalesOrderItem) *ProductSKUQuery {
	query := (&ProductSKUClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(productsku.Table, productsku.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, salesorderitem.ProductSkuTable, salesorderitem.ProductSkuColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QueryUnit(_m *SalesOrderItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, false, salesorderitem.UnitTable, salesorderitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryShipmentItems queries the shipment_items edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QueryShipmentItems(_m *SalesOrderItem) *ShipmentItemQuery {
	query := (&ShipmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(shipmentitem.Table, shipmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, salesorderitem.ShipmentItemsTable, salesorderitem.ShipmentItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryStockReservations queries the stock_reservations edge of a SalesOrderItem.
func (c *SalesOrderItemClient) QueryStockReservations(_m *SalesOrderItem) *StockReservationQuery {
	query := (&StockReservationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(salesorderitem.Table, salesorderitem.FieldID, id),
			sqlgraph.To(stockreservation.Table, stockreservation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, salesorderitem.StockReservationsTable, salesorderitem.StockReservationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *SalesOrderItemClient) Hooks() []Hook {
	return c.hooks.SalesOrderItem
}

// Interceptors returns the client interceptors.
func (c *SalesOrderItemClient) Interceptors() []Interceptor {
	return c.inters.SalesOrderItem
}

func (c *SalesOrderItemClient) mutate(ctx context.Context, m *SalesOrderItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&SalesOrderItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&SalesOrderItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&SalesOrderItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&SalesOrderItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown SalesOrderItem mutation op: %q", m.Op())
	}
}

// ShipmentClient is a client for the Shipment schema.
type ShipmentClient struct {
	config
}

// NewShipmentClient returns a client for the Shipment from the given config.
func NewShipmentClient(c config) *ShipmentClient {
	return &ShipmentClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `shipment.Hooks(f(g(h())))`.
func (c *ShipmentClient) Use(hooks ...Hook) {
	c.hooks.Shipment = append(c.hooks.Shipment, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `shipment.Intercept(f(g(h())))`.
func (c *ShipmentClient) Intercept(interceptors ...Interceptor) {
	c.inters.Shipment = append(c.inters.Shipment, interceptors...)
}

// Create returns a builder for creating a Shipment entity.
func (c *ShipmentClient) Create() *ShipmentCreate {
	mutation := newShipmentMutation(c.config, OpCreate)
	return &ShipmentCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of Shipment entities.
func (c *ShipmentClient) CreateBulk(builders ...*ShipmentCreate) *ShipmentCreateBulk {
	return &ShipmentCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ShipmentClient) MapCreateBulk(slice any, setFunc func(*ShipmentCreate, int)) *ShipmentCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ShipmentCreateBulk{err: fmt.Errorf("calling to ShipmentClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ShipmentCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ShipmentCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for Shipment.
func (c *ShipmentClient) Update() *ShipmentUpdate {
	mutation := newShipmentMutation(c.config, OpUpdate)
	return &ShipmentUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ShipmentClient) UpdateOne(_m *Shipment) *ShipmentUpdateOne {
	mutation := newShipmentMutation(c.config, OpUpdateOne, withShipment(_m))
	return &ShipmentUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ShipmentClient) UpdateOneID(id int) *ShipmentUpdateOne {
	mutation := newShipmentMutation(c.config, OpUpdateOne, withShipmentID(id))
	return &ShipmentUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for Shipment.
func (c *ShipmentClient) Delete() *ShipmentDelete {
	mutation := newShipmentMutation(c.config, OpDelete)
	return &ShipmentDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ShipmentClient) DeleteOne(_m *Shipment) *ShipmentDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ShipmentClient) DeleteOneID(id int) *ShipmentDeleteOne {
	builder := c.Delete().Where(shipment.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ShipmentDeleteOne{builder}
}

// Query returns a query builder for Shipment.
func (c *ShipmentClient) Query() *ShipmentQuery {
	return &ShipmentQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeShipment},
		inters: c.Interceptors(),
	}
}

// Get returns a Shipment entity by its id.
func (c *ShipmentClient) Get(ctx context.Context, id int) (*Shipment, error) {
	return c.Query().Where(shipment.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ShipmentClient) GetX(ctx context.Context, id int) *Shipment {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QuerySalesOrder queries the sales_order edge of a Shipment.
func (c *ShipmentClient) QuerySalesOrder(_m *Shipment) *SalesOrderQuery {
	query := (&SalesOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipment.Table, shipment.FieldID, id),
			sqlgraph.To(salesorder.Table, salesorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipment.SalesOrderTable, shipment.SalesOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryCustomer queries the customer edge of a Shipment.
func (c *ShipmentClient) QueryCustomer(_m *Shipment) *CustomerQuery {
	query := (&CustomerClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipment.Table, shipment.FieldID, id),
			sqlgraph.To(customer.Table, customer.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipment.CustomerTable, shipment.CustomerColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryItems queries the items edge of a Shipment.
func (c *ShipmentClient) QueryItems(_m *Shipment) *ShipmentItemQuery {
	query := (&ShipmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipment.Table, shipment.FieldID, id),
			sqlgraph.To(shipmentitem.Table, shipmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, shipment.ItemsTable, shipment.ItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ShipmentClient) Hooks() []Hook {
	hooks := c.hooks.Shipment
	return append(hooks[:len(hooks):len(hooks)], shipment.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ShipmentClient) Interceptors() []Interceptor {
	return c.inters.Shipment
}

func (c *ShipmentClient) mutate(ctx context.Context, m *ShipmentMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ShipmentCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ShipmentUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ShipmentUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ShipmentDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown Shipment mutation op: %q", m.Op())
	}
}

// ShipmentItemClient is a client for the ShipmentItem schema.
type ShipmentItemClient struct {
	config
}

// NewShipmentItemClient returns a client for the ShipmentItem from the given config.
func NewShipmentItemClient(c config) *ShipmentItemClient {
	return &ShipmentItemClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `shipmentitem.Hooks(f(g(h())))`.
func (c *ShipmentItemClient) Use(hooks ...Hook) {
	c.hooks.ShipmentItem = append(c.hooks.ShipmentItem, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `shipmentitem.Intercept(f(g(h())))`.
func (c *ShipmentItemClient) Intercept(interceptors ...Interceptor) {
	c.inters.ShipmentItem = append(c.inters.ShipmentItem, interceptors...)
}

// Create returns a builder for creating a ShipmentItem entity.
func (c *ShipmentItemClient) Create() *ShipmentItemCreate {
	mutation := newShipmentItemMutation(c.config, OpCreate)
	return &ShipmentItemCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of ShipmentItem entities.
func (c *ShipmentItemClient) CreateBulk(builders ...*ShipmentItemCreate) *ShipmentItemCreateBulk {
	return &ShipmentItemCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *ShipmentItemClient) MapCreateBulk(slice any, setFunc func(*ShipmentItemCreate, int)) *ShipmentItemCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &ShipmentItemCreateBulk{err: fmt.Errorf("calling to ShipmentItemClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*ShipmentItemCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &ShipmentItemCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for ShipmentItem.
func (c *ShipmentItemClient) Update() *ShipmentItemUpdate {
	mutation := newShipmentItemMutation(c.config, OpUpdate)
	return &ShipmentItemUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *ShipmentItemClient) UpdateOne(_m *ShipmentItem) *ShipmentItemUpdateOne {
	mutation := newShipmentItemMutation(c.config, OpUpdateOne, withShipmentItem(_m))
	return &ShipmentItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *ShipmentItemClient) UpdateOneID(id int) *ShipmentItemUpdateOne {
	mutation := newShipmentItemMutation(c.config, OpUpdateOne, withShipmentItemID(id))
	return &ShipmentItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for ShipmentItem.
func (c *ShipmentItemClient) Delete() *ShipmentItemDelete {
	mutation := newShipmentItemMutation(c.config, OpDelete)
	return &ShipmentItemDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *ShipmentItemClient) DeleteOne(_m *ShipmentItem) *ShipmentItemDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *ShipmentItemClient) DeleteOneID(id int) *ShipmentItemDeleteOne {
	builder := c.Delete().Where(shipmentitem.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &ShipmentItemDeleteOne{builder}
}

// Query returns a query builder for ShipmentItem.
func (c *ShipmentItemClient) Query() *ShipmentItemQuery {
	return &ShipmentItemQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeShipmentItem},
		inters: c.Interceptors(),
	}
}

// Get returns a ShipmentItem entity by its id.
func (c *ShipmentItemClient) Get(ctx context.Context, id int) (*ShipmentItem, error) {
	return c.Query().Where(shipmentitem.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *ShipmentItemClient) GetX(ctx context.Context, id int) *ShipmentItem {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryShipment queries the shipment edge of a ShipmentItem.
func (c *ShipmentItemClient) QueryShipment(_m *ShipmentItem) *ShipmentQuery {
	query := (&ShipmentClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(shipment.Table, shipment.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.ShipmentTable, shipmentitem.ShipmentColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QuerySalesOrderItem queries the sales_order_item edge of a ShipmentItem.
func (c *ShipmentItemClient) QuerySalesOrderItem(_m *ShipmentItem) *SalesOrderItemQuery {
	query := (&SalesOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(salesorderitem.Table, salesorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.SalesOrderItemTable, shipmentitem.SalesOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProduct queries the product edge of a ShipmentItem.
func (c *ShipmentItemClient) QueryProduct(_m *ShipmentItem) *ProductQuery {
	query := (&ProductClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(product.Table, product.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.ProductTable, shipmentitem.ProductColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductSku queries the product_sku edge of a ShipmentItem.
func (c *ShipmentItemClient) QueryProductSku(_m *ShipmentItem) *ProductSKUQuery {
	query := (&ProductSKUClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(productsku.Table, productsku.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.ProductSkuTable, shipmentitem.ProductSkuColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWarehouse queries the warehouse edge of a ShipmentItem.
func (c *ShipmentItemClient) QueryWarehouse(_m *ShipmentItem) *WarehouseQuery {
	query := (&WarehouseClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(warehouse.Table, warehouse.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.WarehouseTable, shipmentitem.WarehouseColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a ShipmentItem.
func (c *ShipmentItemClient) QueryUnit(_m *ShipmentItem) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.UnitTable, shipmentitem.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryLot queries the inventory_lot edge of a ShipmentItem.
func (c *ShipmentItemClient) QueryInventoryLot(_m *ShipmentItem) *InventoryLotQuery {
	query := (&InventoryLotClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(shipmentitem.Table, shipmentitem.FieldID, id),
			sqlgraph.To(inventorylot.Table, inventorylot.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, shipmentitem.InventoryLotTable, shipmentitem.InventoryLotColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *ShipmentItemClient) Hooks() []Hook {
	hooks := c.hooks.ShipmentItem
	return append(hooks[:len(hooks):len(hooks)], shipmentitem.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *ShipmentItemClient) Interceptors() []Interceptor {
	return c.inters.ShipmentItem
}

func (c *ShipmentItemClient) mutate(ctx context.Context, m *ShipmentItemMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&ShipmentItemCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&ShipmentItemUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&ShipmentItemUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&ShipmentItemDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown ShipmentItem mutation op: %q", m.Op())
	}
}

// SourceOrderLifecycleEventClient is a client for the SourceOrderLifecycleEvent schema.
type SourceOrderLifecycleEventClient struct {
	config
}

// NewSourceOrderLifecycleEventClient returns a client for the SourceOrderLifecycleEvent from the given config.
func NewSourceOrderLifecycleEventClient(c config) *SourceOrderLifecycleEventClient {
	return &SourceOrderLifecycleEventClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `sourceorderlifecycleevent.Hooks(f(g(h())))`.
func (c *SourceOrderLifecycleEventClient) Use(hooks ...Hook) {
	c.hooks.SourceOrderLifecycleEvent = append(c.hooks.SourceOrderLifecycleEvent, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `sourceorderlifecycleevent.Intercept(f(g(h())))`.
func (c *SourceOrderLifecycleEventClient) Intercept(interceptors ...Interceptor) {
	c.inters.SourceOrderLifecycleEvent = append(c.inters.SourceOrderLifecycleEvent, interceptors...)
}

// Create returns a builder for creating a SourceOrderLifecycleEvent entity.
func (c *SourceOrderLifecycleEventClient) Create() *SourceOrderLifecycleEventCreate {
	mutation := newSourceOrderLifecycleEventMutation(c.config, OpCreate)
	return &SourceOrderLifecycleEventCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of SourceOrderLifecycleEvent entities.
func (c *SourceOrderLifecycleEventClient) CreateBulk(builders ...*SourceOrderLifecycleEventCreate) *SourceOrderLifecycleEventCreateBulk {
	return &SourceOrderLifecycleEventCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *SourceOrderLifecycleEventClient) MapCreateBulk(slice any, setFunc func(*SourceOrderLifecycleEventCreate, int)) *SourceOrderLifecycleEventCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &SourceOrderLifecycleEventCreateBulk{err: fmt.Errorf("calling to SourceOrderLifecycleEventClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*SourceOrderLifecycleEventCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &SourceOrderLifecycleEventCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for SourceOrderLifecycleEvent.
func (c *SourceOrderLifecycleEventClient) Update() *SourceOrderLifecycleEventUpdate {
	mutation := newSourceOrderLifecycleEventMutation(c.config, OpUpdate)
	return &SourceOrderLifecycleEventUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *SourceOrderLifecycleEventClient) UpdateOne(_m *SourceOrderLifecycleEvent) *SourceOrderLifecycleEventUpdateOne {
	mutation := newSourceOrderLifecycleEventMutation(c.config, OpUpdateOne, withSourceOrderLifecycleEvent(_m))
	return &SourceOrderLifecycleEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *SourceOrderLifecycleEventClient) UpdateOneID(id int) *SourceOrderLifecycleEventUpdateOne {
	mutation := newSourceOrderLifecycleEventMutation(c.config, OpUpdateOne, withSourceOrderLifecycleEventID(id))
	return &SourceOrderLifecycleEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for SourceOrderLifecycleEvent.
func (c *SourceOrderLifecycleEventClient) Delete() *SourceOrderLifecycleEventDelete {
	mutation := newSourceOrderLifecycleEventMutation(c.config, OpDelete)
	return &SourceOrderLifecycleEventDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *SourceOrderLifecycleEventClient) DeleteOne(_m *SourceOrderLifecycleEvent) *SourceOrderLifecycleEventDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *SourceOrderLifecycleEventClient) DeleteOneID(id int) *SourceOrderLifecycleEventDeleteOne {
	builder := c.Delete().Where(sourceorderlifecycleevent.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &SourceOrderLifecycleEventDeleteOne{builder}
}

// Query returns a query builder for SourceOrderLifecycleEvent.
func (c *SourceOrderLifecycleEventClient) Query() *SourceOrderLifecycleEventQuery {
	return &SourceOrderLifecycleEventQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeSourceOrderLifecycleEvent},
		inters: c.Interceptors(),
	}
}

// Get returns a SourceOrderLifecycleEvent entity by its id.
func (c *SourceOrderLifecycleEventClient) Get(ctx context.Context, id int) (*SourceOrderLifecycleEvent, error) {
	return c.Query().Where(sourceorderlifecycleevent.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *SourceOrderLifecycleEventClient) GetX(ctx context.Context, id int) *SourceOrderLifecycleEvent {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *SourceOrderLifecycleEventClient) Hooks() []Hook {
	return c.hooks.SourceOrderLifecycleEvent
}

// Interceptors returns the client interceptors.
func (c *SourceOrderLifecycleEventClient) Interceptors() []Interceptor {
	return c.inters.SourceOrderLifecycleEvent
}

func (c *SourceOrderLifecycleEventClient) mutate(ctx context.Context, m *SourceOrderLifecycleEventMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&SourceOrderLifecycleEventCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&SourceOrderLifecycleEventUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&SourceOrderLifecycleEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&SourceOrderLifecycleEventDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown SourceOrderLifecycleEvent mutation op: %q", m.Op())
	}
}

// StockReservationClient is a client for the StockReservation schema.
type StockReservationClient struct {
	config
}

// NewStockReservationClient returns a client for the StockReservation from the given config.
func NewStockReservationClient(c config) *StockReservationClient {
	return &StockReservationClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `stockreservation.Hooks(f(g(h())))`.
func (c *StockReservationClient) Use(hooks ...Hook) {
	c.hooks.StockReservation = append(c.hooks.StockReservation, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `stockreservation.Intercept(f(g(h())))`.
func (c *StockReservationClient) Intercept(interceptors ...Interceptor) {
	c.inters.StockReservation = append(c.inters.StockReservation, interceptors...)
}

// Create returns a builder for creating a StockReservation entity.
func (c *StockReservationClient) Create() *StockReservationCreate {
	mutation := newStockReservationMutation(c.config, OpCreate)
	return &StockReservationCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of StockReservation entities.
func (c *StockReservationClient) CreateBulk(builders ...*StockReservationCreate) *StockReservationCreateBulk {
	return &StockReservationCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *StockReservationClient) MapCreateBulk(slice any, setFunc func(*StockReservationCreate, int)) *StockReservationCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &StockReservationCreateBulk{err: fmt.Errorf("calling to StockReservationClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*StockReservationCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &StockReservationCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for StockReservation.
func (c *StockReservationClient) Update() *StockReservationUpdate {
	mutation := newStockReservationMutation(c.config, OpUpdate)
	return &StockReservationUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *StockReservationClient) UpdateOne(_m *StockReservation) *StockReservationUpdateOne {
	mutation := newStockReservationMutation(c.config, OpUpdateOne, withStockReservation(_m))
	return &StockReservationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *StockReservationClient) UpdateOneID(id int) *StockReservationUpdateOne {
	mutation := newStockReservationMutation(c.config, OpUpdateOne, withStockReservationID(id))
	return &StockReservationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for StockReservation.
func (c *StockReservationClient) Delete() *StockReservationDelete {
	mutation := newStockReservationMutation(c.config, OpDelete)
	return &StockReservationDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *StockReservationClient) DeleteOne(_m *StockReservation) *StockReservationDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *StockReservationClient) DeleteOneID(id int) *StockReservationDeleteOne {
	builder := c.Delete().Where(stockreservation.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &StockReservationDeleteOne{builder}
}

// Query returns a query builder for StockReservation.
func (c *StockReservationClient) Query() *StockReservationQuery {
	return &StockReservationQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeStockReservation},
		inters: c.Interceptors(),
	}
}

// Get returns a StockReservation entity by its id.
func (c *StockReservationClient) Get(ctx context.Context, id int) (*StockReservation, error) {
	return c.Query().Where(stockreservation.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *StockReservationClient) GetX(ctx context.Context, id int) *StockReservation {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QuerySalesOrder queries the sales_order edge of a StockReservation.
func (c *StockReservationClient) QuerySalesOrder(_m *StockReservation) *SalesOrderQuery {
	query := (&SalesOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(salesorder.Table, salesorder.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.SalesOrderTable, stockreservation.SalesOrderColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QuerySalesOrderItem queries the sales_order_item edge of a StockReservation.
func (c *StockReservationClient) QuerySalesOrderItem(_m *StockReservation) *SalesOrderItemQuery {
	query := (&SalesOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(salesorderitem.Table, salesorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.SalesOrderItemTable, stockreservation.SalesOrderItemColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProduct queries the product edge of a StockReservation.
func (c *StockReservationClient) QueryProduct(_m *StockReservation) *ProductQuery {
	query := (&ProductClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(product.Table, product.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.ProductTable, stockreservation.ProductColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductSku queries the product_sku edge of a StockReservation.
func (c *StockReservationClient) QueryProductSku(_m *StockReservation) *ProductSKUQuery {
	query := (&ProductSKUClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(productsku.Table, productsku.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.ProductSkuTable, stockreservation.ProductSkuColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryWarehouse queries the warehouse edge of a StockReservation.
func (c *StockReservationClient) QueryWarehouse(_m *StockReservation) *WarehouseQuery {
	query := (&WarehouseClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(warehouse.Table, warehouse.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.WarehouseTable, stockreservation.WarehouseColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryUnit queries the unit edge of a StockReservation.
func (c *StockReservationClient) QueryUnit(_m *StockReservation) *UnitQuery {
	query := (&UnitClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(unit.Table, unit.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.UnitTable, stockreservation.UnitColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryLot queries the inventory_lot edge of a StockReservation.
func (c *StockReservationClient) QueryInventoryLot(_m *StockReservation) *InventoryLotQuery {
	query := (&InventoryLotClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(stockreservation.Table, stockreservation.FieldID, id),
			sqlgraph.To(inventorylot.Table, inventorylot.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, stockreservation.InventoryLotTable, stockreservation.InventoryLotColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *StockReservationClient) Hooks() []Hook {
	hooks := c.hooks.StockReservation
	return append(hooks[:len(hooks):len(hooks)], stockreservation.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *StockReservationClient) Interceptors() []Interceptor {
	return c.inters.StockReservation
}

func (c *StockReservationClient) mutate(ctx context.Context, m *StockReservationMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&StockReservationCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&StockReservationUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&StockReservationUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&StockReservationDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown StockReservation mutation op: %q", m.Op())
	}
}

// SupplierClient is a client for the Supplier schema.
type SupplierClient struct {
	config
}

// NewSupplierClient returns a client for the Supplier from the given config.
func NewSupplierClient(c config) *SupplierClient {
	return &SupplierClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `supplier.Hooks(f(g(h())))`.
func (c *SupplierClient) Use(hooks ...Hook) {
	c.hooks.Supplier = append(c.hooks.Supplier, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `supplier.Intercept(f(g(h())))`.
func (c *SupplierClient) Intercept(interceptors ...Interceptor) {
	c.inters.Supplier = append(c.inters.Supplier, interceptors...)
}

// Create returns a builder for creating a Supplier entity.
func (c *SupplierClient) Create() *SupplierCreate {
	mutation := newSupplierMutation(c.config, OpCreate)
	return &SupplierCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of Supplier entities.
func (c *SupplierClient) CreateBulk(builders ...*SupplierCreate) *SupplierCreateBulk {
	return &SupplierCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *SupplierClient) MapCreateBulk(slice any, setFunc func(*SupplierCreate, int)) *SupplierCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &SupplierCreateBulk{err: fmt.Errorf("calling to SupplierClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*SupplierCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &SupplierCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for Supplier.
func (c *SupplierClient) Update() *SupplierUpdate {
	mutation := newSupplierMutation(c.config, OpUpdate)
	return &SupplierUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *SupplierClient) UpdateOne(_m *Supplier) *SupplierUpdateOne {
	mutation := newSupplierMutation(c.config, OpUpdateOne, withSupplier(_m))
	return &SupplierUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *SupplierClient) UpdateOneID(id int) *SupplierUpdateOne {
	mutation := newSupplierMutation(c.config, OpUpdateOne, withSupplierID(id))
	return &SupplierUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for Supplier.
func (c *SupplierClient) Delete() *SupplierDelete {
	mutation := newSupplierMutation(c.config, OpDelete)
	return &SupplierDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *SupplierClient) DeleteOne(_m *Supplier) *SupplierDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *SupplierClient) DeleteOneID(id int) *SupplierDeleteOne {
	builder := c.Delete().Where(supplier.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &SupplierDeleteOne{builder}
}

// Query returns a query builder for Supplier.
func (c *SupplierClient) Query() *SupplierQuery {
	return &SupplierQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeSupplier},
		inters: c.Interceptors(),
	}
}

// Get returns a Supplier entity by its id.
func (c *SupplierClient) Get(ctx context.Context, id int) (*Supplier, error) {
	return c.Query().Where(supplier.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *SupplierClient) GetX(ctx context.Context, id int) *Supplier {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryPurchaseOrders queries the purchase_orders edge of a Supplier.
func (c *SupplierClient) QueryPurchaseOrders(_m *Supplier) *PurchaseOrderQuery {
	query := (&PurchaseOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(supplier.Table, supplier.FieldID, id),
			sqlgraph.To(purchaseorder.Table, purchaseorder.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, supplier.PurchaseOrdersTable, supplier.PurchaseOrdersColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceipts queries the purchase_receipts edge of a Supplier.
func (c *SupplierClient) QueryPurchaseReceipts(_m *Supplier) *PurchaseReceiptQuery {
	query := (&PurchaseReceiptClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(supplier.Table, supplier.FieldID, id),
			sqlgraph.To(purchasereceipt.Table, purchasereceipt.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, supplier.PurchaseReceiptsTable, supplier.PurchaseReceiptsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOutsourcingOrders queries the outsourcing_orders edge of a Supplier.
func (c *SupplierClient) QueryOutsourcingOrders(_m *Supplier) *OutsourcingOrderQuery {
	query := (&OutsourcingOrderClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(supplier.Table, supplier.FieldID, id),
			sqlgraph.To(outsourcingorder.Table, outsourcingorder.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, supplier.OutsourcingOrdersTable, supplier.OutsourcingOrdersColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProcessCapabilities queries the process_capabilities edge of a Supplier.
func (c *SupplierClient) QueryProcessCapabilities(_m *Supplier) *ProcessQuery {
	query := (&ProcessClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(supplier.Table, supplier.FieldID, id),
			sqlgraph.To(process.Table, process.FieldID),
			sqlgraph.Edge(sqlgraph.M2M, false, supplier.ProcessCapabilitiesTable, supplier.ProcessCapabilitiesPrimaryKey...),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *SupplierClient) Hooks() []Hook {
	return c.hooks.Supplier
}

// Interceptors returns the client interceptors.
func (c *SupplierClient) Interceptors() []Interceptor {
	return c.inters.Supplier
}

func (c *SupplierClient) mutate(ctx context.Context, m *SupplierMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&SupplierCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&SupplierUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&SupplierUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&SupplierDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown Supplier mutation op: %q", m.Op())
	}
}

// UnitClient is a client for the Unit schema.
type UnitClient struct {
	config
}

// NewUnitClient returns a client for the Unit from the given config.
func NewUnitClient(c config) *UnitClient {
	return &UnitClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `unit.Hooks(f(g(h())))`.
func (c *UnitClient) Use(hooks ...Hook) {
	c.hooks.Unit = append(c.hooks.Unit, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `unit.Intercept(f(g(h())))`.
func (c *UnitClient) Intercept(interceptors ...Interceptor) {
	c.inters.Unit = append(c.inters.Unit, interceptors...)
}

// Create returns a builder for creating a Unit entity.
func (c *UnitClient) Create() *UnitCreate {
	mutation := newUnitMutation(c.config, OpCreate)
	return &UnitCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of Unit entities.
func (c *UnitClient) CreateBulk(builders ...*UnitCreate) *UnitCreateBulk {
	return &UnitCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *UnitClient) MapCreateBulk(slice any, setFunc func(*UnitCreate, int)) *UnitCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &UnitCreateBulk{err: fmt.Errorf("calling to UnitClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*UnitCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &UnitCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for Unit.
func (c *UnitClient) Update() *UnitUpdate {
	mutation := newUnitMutation(c.config, OpUpdate)
	return &UnitUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *UnitClient) UpdateOne(_m *Unit) *UnitUpdateOne {
	mutation := newUnitMutation(c.config, OpUpdateOne, withUnit(_m))
	return &UnitUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *UnitClient) UpdateOneID(id int) *UnitUpdateOne {
	mutation := newUnitMutation(c.config, OpUpdateOne, withUnitID(id))
	return &UnitUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for Unit.
func (c *UnitClient) Delete() *UnitDelete {
	mutation := newUnitMutation(c.config, OpDelete)
	return &UnitDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *UnitClient) DeleteOne(_m *Unit) *UnitDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *UnitClient) DeleteOneID(id int) *UnitDeleteOne {
	builder := c.Delete().Where(unit.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &UnitDeleteOne{builder}
}

// Query returns a query builder for Unit.
func (c *UnitClient) Query() *UnitQuery {
	return &UnitQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeUnit},
		inters: c.Interceptors(),
	}
}

// Get returns a Unit entity by its id.
func (c *UnitClient) Get(ctx context.Context, id int) (*Unit, error) {
	return c.Query().Where(unit.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *UnitClient) GetX(ctx context.Context, id int) *Unit {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryMaterials queries the materials edge of a Unit.
func (c *UnitClient) QueryMaterials(_m *Unit) *MaterialQuery {
	query := (&MaterialClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(material.Table, material.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.MaterialsTable, unit.MaterialsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProducts queries the products edge of a Unit.
func (c *UnitClient) QueryProducts(_m *Unit) *ProductQuery {
	query := (&ProductClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(product.Table, product.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.ProductsTable, unit.ProductsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductSkus queries the product_skus edge of a Unit.
func (c *UnitClient) QueryProductSkus(_m *Unit) *ProductSKUQuery {
	query := (&ProductSKUClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(productsku.Table, productsku.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.ProductSkusTable, unit.ProductSkusColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryTxns queries the inventory_txns edge of a Unit.
func (c *UnitClient) QueryInventoryTxns(_m *Unit) *InventoryTxnQuery {
	query := (&InventoryTxnClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(inventorytxn.Table, inventorytxn.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.InventoryTxnsTable, unit.InventoryTxnsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryBalances queries the inventory_balances edge of a Unit.
func (c *UnitClient) QueryInventoryBalances(_m *Unit) *InventoryBalanceQuery {
	query := (&InventoryBalanceClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(inventorybalance.Table, inventorybalance.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.InventoryBalancesTable, unit.InventoryBalancesColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryBomItems queries the bom_items edge of a Unit.
func (c *UnitClient) QueryBomItems(_m *Unit) *BOMItemQuery {
	query := (&BOMItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(bomitem.Table, bomitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.BomItemsTable, unit.BomItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionOrderMaterialRequirements queries the production_order_material_requirements edge of a Unit.
func (c *UnitClient) QueryProductionOrderMaterialRequirements(_m *Unit) *ProductionOrderMaterialRequirementQuery {
	query := (&ProductionOrderMaterialRequirementClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(productionordermaterialrequirement.Table, productionordermaterialrequirement.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.ProductionOrderMaterialRequirementsTable, unit.ProductionOrderMaterialRequirementsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOutsourcingOrderItems queries the outsourcing_order_items edge of a Unit.
func (c *UnitClient) QueryOutsourcingOrderItems(_m *Unit) *OutsourcingOrderItemQuery {
	query := (&OutsourcingOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(outsourcingorderitem.Table, outsourcingorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.OutsourcingOrderItemsTable, unit.OutsourcingOrderItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseOrderItems queries the purchase_order_items edge of a Unit.
func (c *UnitClient) QueryPurchaseOrderItems(_m *Unit) *PurchaseOrderItemQuery {
	query := (&PurchaseOrderItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(purchaseorderitem.Table, purchaseorderitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.PurchaseOrderItemsTable, unit.PurchaseOrderItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptItems queries the purchase_receipt_items edge of a Unit.
func (c *UnitClient) QueryPurchaseReceiptItems(_m *Unit) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.PurchaseReceiptItemsTable, unit.PurchaseReceiptItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReturnItems queries the purchase_return_items edge of a Unit.
func (c *UnitClient) QueryPurchaseReturnItems(_m *Unit) *PurchaseReturnItemQuery {
	query := (&PurchaseReturnItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(purchasereturnitem.Table, purchasereturnitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.PurchaseReturnItemsTable, unit.PurchaseReturnItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptAdjustmentItems queries the purchase_receipt_adjustment_items edge of a Unit.
func (c *UnitClient) QueryPurchaseReceiptAdjustmentItems(_m *Unit) *PurchaseReceiptAdjustmentItemQuery {
	query := (&PurchaseReceiptAdjustmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.PurchaseReceiptAdjustmentItemsTable, unit.PurchaseReceiptAdjustmentItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionFacts queries the production_facts edge of a Unit.
func (c *UnitClient) QueryProductionFacts(_m *Unit) *ProductionFactQuery {
	query := (&ProductionFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(productionfact.Table, productionfact.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.ProductionFactsTable, unit.ProductionFactsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOutsourcingFacts queries the outsourcing_facts edge of a Unit.
func (c *UnitClient) QueryOutsourcingFacts(_m *Unit) *OutsourcingFactQuery {
	query := (&OutsourcingFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(outsourcingfact.Table, outsourcingfact.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.OutsourcingFactsTable, unit.OutsourcingFactsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryShipmentItems queries the shipment_items edge of a Unit.
func (c *UnitClient) QueryShipmentItems(_m *Unit) *ShipmentItemQuery {
	query := (&ShipmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(shipmentitem.Table, shipmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.ShipmentItemsTable, unit.ShipmentItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryStockReservations queries the stock_reservations edge of a Unit.
func (c *UnitClient) QueryStockReservations(_m *Unit) *StockReservationQuery {
	query := (&StockReservationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(unit.Table, unit.FieldID, id),
			sqlgraph.To(stockreservation.Table, stockreservation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, unit.StockReservationsTable, unit.StockReservationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *UnitClient) Hooks() []Hook {
	return c.hooks.Unit
}

// Interceptors returns the client interceptors.
func (c *UnitClient) Interceptors() []Interceptor {
	return c.inters.Unit
}

func (c *UnitClient) mutate(ctx context.Context, m *UnitMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&UnitCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&UnitUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&UnitUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&UnitDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown Unit mutation op: %q", m.Op())
	}
}

// WarehouseClient is a client for the Warehouse schema.
type WarehouseClient struct {
	config
}

// NewWarehouseClient returns a client for the Warehouse from the given config.
func NewWarehouseClient(c config) *WarehouseClient {
	return &WarehouseClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `warehouse.Hooks(f(g(h())))`.
func (c *WarehouseClient) Use(hooks ...Hook) {
	c.hooks.Warehouse = append(c.hooks.Warehouse, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `warehouse.Intercept(f(g(h())))`.
func (c *WarehouseClient) Intercept(interceptors ...Interceptor) {
	c.inters.Warehouse = append(c.inters.Warehouse, interceptors...)
}

// Create returns a builder for creating a Warehouse entity.
func (c *WarehouseClient) Create() *WarehouseCreate {
	mutation := newWarehouseMutation(c.config, OpCreate)
	return &WarehouseCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of Warehouse entities.
func (c *WarehouseClient) CreateBulk(builders ...*WarehouseCreate) *WarehouseCreateBulk {
	return &WarehouseCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WarehouseClient) MapCreateBulk(slice any, setFunc func(*WarehouseCreate, int)) *WarehouseCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WarehouseCreateBulk{err: fmt.Errorf("calling to WarehouseClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WarehouseCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WarehouseCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for Warehouse.
func (c *WarehouseClient) Update() *WarehouseUpdate {
	mutation := newWarehouseMutation(c.config, OpUpdate)
	return &WarehouseUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WarehouseClient) UpdateOne(_m *Warehouse) *WarehouseUpdateOne {
	mutation := newWarehouseMutation(c.config, OpUpdateOne, withWarehouse(_m))
	return &WarehouseUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WarehouseClient) UpdateOneID(id int) *WarehouseUpdateOne {
	mutation := newWarehouseMutation(c.config, OpUpdateOne, withWarehouseID(id))
	return &WarehouseUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for Warehouse.
func (c *WarehouseClient) Delete() *WarehouseDelete {
	mutation := newWarehouseMutation(c.config, OpDelete)
	return &WarehouseDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WarehouseClient) DeleteOne(_m *Warehouse) *WarehouseDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WarehouseClient) DeleteOneID(id int) *WarehouseDeleteOne {
	builder := c.Delete().Where(warehouse.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WarehouseDeleteOne{builder}
}

// Query returns a query builder for Warehouse.
func (c *WarehouseClient) Query() *WarehouseQuery {
	return &WarehouseQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWarehouse},
		inters: c.Interceptors(),
	}
}

// Get returns a Warehouse entity by its id.
func (c *WarehouseClient) Get(ctx context.Context, id int) (*Warehouse, error) {
	return c.Query().Where(warehouse.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WarehouseClient) GetX(ctx context.Context, id int) *Warehouse {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryInventoryTxns queries the inventory_txns edge of a Warehouse.
func (c *WarehouseClient) QueryInventoryTxns(_m *Warehouse) *InventoryTxnQuery {
	query := (&InventoryTxnClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(inventorytxn.Table, inventorytxn.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.InventoryTxnsTable, warehouse.InventoryTxnsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryInventoryBalances queries the inventory_balances edge of a Warehouse.
func (c *WarehouseClient) QueryInventoryBalances(_m *Warehouse) *InventoryBalanceQuery {
	query := (&InventoryBalanceClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(inventorybalance.Table, inventorybalance.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.InventoryBalancesTable, warehouse.InventoryBalancesColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptItems queries the purchase_receipt_items edge of a Warehouse.
func (c *WarehouseClient) QueryPurchaseReceiptItems(_m *Warehouse) *PurchaseReceiptItemQuery {
	query := (&PurchaseReceiptItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(purchasereceiptitem.Table, purchasereceiptitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.PurchaseReceiptItemsTable, warehouse.PurchaseReceiptItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReturnItems queries the purchase_return_items edge of a Warehouse.
func (c *WarehouseClient) QueryPurchaseReturnItems(_m *Warehouse) *PurchaseReturnItemQuery {
	query := (&PurchaseReturnItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(purchasereturnitem.Table, purchasereturnitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.PurchaseReturnItemsTable, warehouse.PurchaseReturnItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryPurchaseReceiptAdjustmentItems queries the purchase_receipt_adjustment_items edge of a Warehouse.
func (c *WarehouseClient) QueryPurchaseReceiptAdjustmentItems(_m *Warehouse) *PurchaseReceiptAdjustmentItemQuery {
	query := (&PurchaseReceiptAdjustmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(purchasereceiptadjustmentitem.Table, purchasereceiptadjustmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.PurchaseReceiptAdjustmentItemsTable, warehouse.PurchaseReceiptAdjustmentItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryQualityInspections queries the quality_inspections edge of a Warehouse.
func (c *WarehouseClient) QueryQualityInspections(_m *Warehouse) *QualityInspectionQuery {
	query := (&QualityInspectionClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(qualityinspection.Table, qualityinspection.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.QualityInspectionsTable, warehouse.QualityInspectionsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProductionFacts queries the production_facts edge of a Warehouse.
func (c *WarehouseClient) QueryProductionFacts(_m *Warehouse) *ProductionFactQuery {
	query := (&ProductionFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(productionfact.Table, productionfact.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.ProductionFactsTable, warehouse.ProductionFactsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryOutsourcingFacts queries the outsourcing_facts edge of a Warehouse.
func (c *WarehouseClient) QueryOutsourcingFacts(_m *Warehouse) *OutsourcingFactQuery {
	query := (&OutsourcingFactClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(outsourcingfact.Table, outsourcingfact.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.OutsourcingFactsTable, warehouse.OutsourcingFactsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryShipmentItems queries the shipment_items edge of a Warehouse.
func (c *WarehouseClient) QueryShipmentItems(_m *Warehouse) *ShipmentItemQuery {
	query := (&ShipmentItemClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(shipmentitem.Table, shipmentitem.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.ShipmentItemsTable, warehouse.ShipmentItemsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryStockReservations queries the stock_reservations edge of a Warehouse.
func (c *WarehouseClient) QueryStockReservations(_m *Warehouse) *StockReservationQuery {
	query := (&StockReservationClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(warehouse.Table, warehouse.FieldID, id),
			sqlgraph.To(stockreservation.Table, stockreservation.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, warehouse.StockReservationsTable, warehouse.StockReservationsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *WarehouseClient) Hooks() []Hook {
	return c.hooks.Warehouse
}

// Interceptors returns the client interceptors.
func (c *WarehouseClient) Interceptors() []Interceptor {
	return c.inters.Warehouse
}

func (c *WarehouseClient) mutate(ctx context.Context, m *WarehouseMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WarehouseCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WarehouseUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WarehouseUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WarehouseDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown Warehouse mutation op: %q", m.Op())
	}
}

// WorkPoolClient is a client for the WorkPool schema.
type WorkPoolClient struct {
	config
}

// NewWorkPoolClient returns a client for the WorkPool from the given config.
func NewWorkPoolClient(c config) *WorkPoolClient {
	return &WorkPoolClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `workpool.Hooks(f(g(h())))`.
func (c *WorkPoolClient) Use(hooks ...Hook) {
	c.hooks.WorkPool = append(c.hooks.WorkPool, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `workpool.Intercept(f(g(h())))`.
func (c *WorkPoolClient) Intercept(interceptors ...Interceptor) {
	c.inters.WorkPool = append(c.inters.WorkPool, interceptors...)
}

// Create returns a builder for creating a WorkPool entity.
func (c *WorkPoolClient) Create() *WorkPoolCreate {
	mutation := newWorkPoolMutation(c.config, OpCreate)
	return &WorkPoolCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WorkPool entities.
func (c *WorkPoolClient) CreateBulk(builders ...*WorkPoolCreate) *WorkPoolCreateBulk {
	return &WorkPoolCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WorkPoolClient) MapCreateBulk(slice any, setFunc func(*WorkPoolCreate, int)) *WorkPoolCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WorkPoolCreateBulk{err: fmt.Errorf("calling to WorkPoolClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WorkPoolCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WorkPoolCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WorkPool.
func (c *WorkPoolClient) Update() *WorkPoolUpdate {
	mutation := newWorkPoolMutation(c.config, OpUpdate)
	return &WorkPoolUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WorkPoolClient) UpdateOne(_m *WorkPool) *WorkPoolUpdateOne {
	mutation := newWorkPoolMutation(c.config, OpUpdateOne, withWorkPool(_m))
	return &WorkPoolUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WorkPoolClient) UpdateOneID(id int) *WorkPoolUpdateOne {
	mutation := newWorkPoolMutation(c.config, OpUpdateOne, withWorkPoolID(id))
	return &WorkPoolUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WorkPool.
func (c *WorkPoolClient) Delete() *WorkPoolDelete {
	mutation := newWorkPoolMutation(c.config, OpDelete)
	return &WorkPoolDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WorkPoolClient) DeleteOne(_m *WorkPool) *WorkPoolDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WorkPoolClient) DeleteOneID(id int) *WorkPoolDeleteOne {
	builder := c.Delete().Where(workpool.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WorkPoolDeleteOne{builder}
}

// Query returns a query builder for WorkPool.
func (c *WorkPoolClient) Query() *WorkPoolQuery {
	return &WorkPoolQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWorkPool},
		inters: c.Interceptors(),
	}
}

// Get returns a WorkPool entity by its id.
func (c *WorkPoolClient) Get(ctx context.Context, id int) (*WorkPool, error) {
	return c.Query().Where(workpool.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WorkPoolClient) GetX(ctx context.Context, id int) *WorkPool {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *WorkPoolClient) Hooks() []Hook {
	return c.hooks.WorkPool
}

// Interceptors returns the client interceptors.
func (c *WorkPoolClient) Interceptors() []Interceptor {
	return c.inters.WorkPool
}

func (c *WorkPoolClient) mutate(ctx context.Context, m *WorkPoolMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WorkPoolCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WorkPoolUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WorkPoolUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WorkPoolDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown WorkPool mutation op: %q", m.Op())
	}
}

// WorkPoolMembershipClient is a client for the WorkPoolMembership schema.
type WorkPoolMembershipClient struct {
	config
}

// NewWorkPoolMembershipClient returns a client for the WorkPoolMembership from the given config.
func NewWorkPoolMembershipClient(c config) *WorkPoolMembershipClient {
	return &WorkPoolMembershipClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `workpoolmembership.Hooks(f(g(h())))`.
func (c *WorkPoolMembershipClient) Use(hooks ...Hook) {
	c.hooks.WorkPoolMembership = append(c.hooks.WorkPoolMembership, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `workpoolmembership.Intercept(f(g(h())))`.
func (c *WorkPoolMembershipClient) Intercept(interceptors ...Interceptor) {
	c.inters.WorkPoolMembership = append(c.inters.WorkPoolMembership, interceptors...)
}

// Create returns a builder for creating a WorkPoolMembership entity.
func (c *WorkPoolMembershipClient) Create() *WorkPoolMembershipCreate {
	mutation := newWorkPoolMembershipMutation(c.config, OpCreate)
	return &WorkPoolMembershipCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WorkPoolMembership entities.
func (c *WorkPoolMembershipClient) CreateBulk(builders ...*WorkPoolMembershipCreate) *WorkPoolMembershipCreateBulk {
	return &WorkPoolMembershipCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WorkPoolMembershipClient) MapCreateBulk(slice any, setFunc func(*WorkPoolMembershipCreate, int)) *WorkPoolMembershipCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WorkPoolMembershipCreateBulk{err: fmt.Errorf("calling to WorkPoolMembershipClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WorkPoolMembershipCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WorkPoolMembershipCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WorkPoolMembership.
func (c *WorkPoolMembershipClient) Update() *WorkPoolMembershipUpdate {
	mutation := newWorkPoolMembershipMutation(c.config, OpUpdate)
	return &WorkPoolMembershipUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WorkPoolMembershipClient) UpdateOne(_m *WorkPoolMembership) *WorkPoolMembershipUpdateOne {
	mutation := newWorkPoolMembershipMutation(c.config, OpUpdateOne, withWorkPoolMembership(_m))
	return &WorkPoolMembershipUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WorkPoolMembershipClient) UpdateOneID(id int) *WorkPoolMembershipUpdateOne {
	mutation := newWorkPoolMembershipMutation(c.config, OpUpdateOne, withWorkPoolMembershipID(id))
	return &WorkPoolMembershipUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WorkPoolMembership.
func (c *WorkPoolMembershipClient) Delete() *WorkPoolMembershipDelete {
	mutation := newWorkPoolMembershipMutation(c.config, OpDelete)
	return &WorkPoolMembershipDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WorkPoolMembershipClient) DeleteOne(_m *WorkPoolMembership) *WorkPoolMembershipDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WorkPoolMembershipClient) DeleteOneID(id int) *WorkPoolMembershipDeleteOne {
	builder := c.Delete().Where(workpoolmembership.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WorkPoolMembershipDeleteOne{builder}
}

// Query returns a query builder for WorkPoolMembership.
func (c *WorkPoolMembershipClient) Query() *WorkPoolMembershipQuery {
	return &WorkPoolMembershipQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWorkPoolMembership},
		inters: c.Interceptors(),
	}
}

// Get returns a WorkPoolMembership entity by its id.
func (c *WorkPoolMembershipClient) Get(ctx context.Context, id int) (*WorkPoolMembership, error) {
	return c.Query().Where(workpoolmembership.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WorkPoolMembershipClient) GetX(ctx context.Context, id int) *WorkPoolMembership {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *WorkPoolMembershipClient) Hooks() []Hook {
	return c.hooks.WorkPoolMembership
}

// Interceptors returns the client interceptors.
func (c *WorkPoolMembershipClient) Interceptors() []Interceptor {
	return c.inters.WorkPoolMembership
}

func (c *WorkPoolMembershipClient) mutate(ctx context.Context, m *WorkPoolMembershipMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WorkPoolMembershipCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WorkPoolMembershipUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WorkPoolMembershipUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WorkPoolMembershipDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown WorkPoolMembership mutation op: %q", m.Op())
	}
}

// WorkflowBusinessStateClient is a client for the WorkflowBusinessState schema.
type WorkflowBusinessStateClient struct {
	config
}

// NewWorkflowBusinessStateClient returns a client for the WorkflowBusinessState from the given config.
func NewWorkflowBusinessStateClient(c config) *WorkflowBusinessStateClient {
	return &WorkflowBusinessStateClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `workflowbusinessstate.Hooks(f(g(h())))`.
func (c *WorkflowBusinessStateClient) Use(hooks ...Hook) {
	c.hooks.WorkflowBusinessState = append(c.hooks.WorkflowBusinessState, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `workflowbusinessstate.Intercept(f(g(h())))`.
func (c *WorkflowBusinessStateClient) Intercept(interceptors ...Interceptor) {
	c.inters.WorkflowBusinessState = append(c.inters.WorkflowBusinessState, interceptors...)
}

// Create returns a builder for creating a WorkflowBusinessState entity.
func (c *WorkflowBusinessStateClient) Create() *WorkflowBusinessStateCreate {
	mutation := newWorkflowBusinessStateMutation(c.config, OpCreate)
	return &WorkflowBusinessStateCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WorkflowBusinessState entities.
func (c *WorkflowBusinessStateClient) CreateBulk(builders ...*WorkflowBusinessStateCreate) *WorkflowBusinessStateCreateBulk {
	return &WorkflowBusinessStateCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WorkflowBusinessStateClient) MapCreateBulk(slice any, setFunc func(*WorkflowBusinessStateCreate, int)) *WorkflowBusinessStateCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WorkflowBusinessStateCreateBulk{err: fmt.Errorf("calling to WorkflowBusinessStateClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WorkflowBusinessStateCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WorkflowBusinessStateCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WorkflowBusinessState.
func (c *WorkflowBusinessStateClient) Update() *WorkflowBusinessStateUpdate {
	mutation := newWorkflowBusinessStateMutation(c.config, OpUpdate)
	return &WorkflowBusinessStateUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WorkflowBusinessStateClient) UpdateOne(_m *WorkflowBusinessState) *WorkflowBusinessStateUpdateOne {
	mutation := newWorkflowBusinessStateMutation(c.config, OpUpdateOne, withWorkflowBusinessState(_m))
	return &WorkflowBusinessStateUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WorkflowBusinessStateClient) UpdateOneID(id int) *WorkflowBusinessStateUpdateOne {
	mutation := newWorkflowBusinessStateMutation(c.config, OpUpdateOne, withWorkflowBusinessStateID(id))
	return &WorkflowBusinessStateUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WorkflowBusinessState.
func (c *WorkflowBusinessStateClient) Delete() *WorkflowBusinessStateDelete {
	mutation := newWorkflowBusinessStateMutation(c.config, OpDelete)
	return &WorkflowBusinessStateDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WorkflowBusinessStateClient) DeleteOne(_m *WorkflowBusinessState) *WorkflowBusinessStateDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WorkflowBusinessStateClient) DeleteOneID(id int) *WorkflowBusinessStateDeleteOne {
	builder := c.Delete().Where(workflowbusinessstate.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WorkflowBusinessStateDeleteOne{builder}
}

// Query returns a query builder for WorkflowBusinessState.
func (c *WorkflowBusinessStateClient) Query() *WorkflowBusinessStateQuery {
	return &WorkflowBusinessStateQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWorkflowBusinessState},
		inters: c.Interceptors(),
	}
}

// Get returns a WorkflowBusinessState entity by its id.
func (c *WorkflowBusinessStateClient) Get(ctx context.Context, id int) (*WorkflowBusinessState, error) {
	return c.Query().Where(workflowbusinessstate.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WorkflowBusinessStateClient) GetX(ctx context.Context, id int) *WorkflowBusinessState {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *WorkflowBusinessStateClient) Hooks() []Hook {
	return c.hooks.WorkflowBusinessState
}

// Interceptors returns the client interceptors.
func (c *WorkflowBusinessStateClient) Interceptors() []Interceptor {
	return c.inters.WorkflowBusinessState
}

func (c *WorkflowBusinessStateClient) mutate(ctx context.Context, m *WorkflowBusinessStateMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WorkflowBusinessStateCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WorkflowBusinessStateUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WorkflowBusinessStateUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WorkflowBusinessStateDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown WorkflowBusinessState mutation op: %q", m.Op())
	}
}

// WorkflowTaskClient is a client for the WorkflowTask schema.
type WorkflowTaskClient struct {
	config
}

// NewWorkflowTaskClient returns a client for the WorkflowTask from the given config.
func NewWorkflowTaskClient(c config) *WorkflowTaskClient {
	return &WorkflowTaskClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `workflowtask.Hooks(f(g(h())))`.
func (c *WorkflowTaskClient) Use(hooks ...Hook) {
	c.hooks.WorkflowTask = append(c.hooks.WorkflowTask, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `workflowtask.Intercept(f(g(h())))`.
func (c *WorkflowTaskClient) Intercept(interceptors ...Interceptor) {
	c.inters.WorkflowTask = append(c.inters.WorkflowTask, interceptors...)
}

// Create returns a builder for creating a WorkflowTask entity.
func (c *WorkflowTaskClient) Create() *WorkflowTaskCreate {
	mutation := newWorkflowTaskMutation(c.config, OpCreate)
	return &WorkflowTaskCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WorkflowTask entities.
func (c *WorkflowTaskClient) CreateBulk(builders ...*WorkflowTaskCreate) *WorkflowTaskCreateBulk {
	return &WorkflowTaskCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WorkflowTaskClient) MapCreateBulk(slice any, setFunc func(*WorkflowTaskCreate, int)) *WorkflowTaskCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WorkflowTaskCreateBulk{err: fmt.Errorf("calling to WorkflowTaskClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WorkflowTaskCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WorkflowTaskCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WorkflowTask.
func (c *WorkflowTaskClient) Update() *WorkflowTaskUpdate {
	mutation := newWorkflowTaskMutation(c.config, OpUpdate)
	return &WorkflowTaskUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WorkflowTaskClient) UpdateOne(_m *WorkflowTask) *WorkflowTaskUpdateOne {
	mutation := newWorkflowTaskMutation(c.config, OpUpdateOne, withWorkflowTask(_m))
	return &WorkflowTaskUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WorkflowTaskClient) UpdateOneID(id int) *WorkflowTaskUpdateOne {
	mutation := newWorkflowTaskMutation(c.config, OpUpdateOne, withWorkflowTaskID(id))
	return &WorkflowTaskUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WorkflowTask.
func (c *WorkflowTaskClient) Delete() *WorkflowTaskDelete {
	mutation := newWorkflowTaskMutation(c.config, OpDelete)
	return &WorkflowTaskDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WorkflowTaskClient) DeleteOne(_m *WorkflowTask) *WorkflowTaskDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WorkflowTaskClient) DeleteOneID(id int) *WorkflowTaskDeleteOne {
	builder := c.Delete().Where(workflowtask.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WorkflowTaskDeleteOne{builder}
}

// Query returns a query builder for WorkflowTask.
func (c *WorkflowTaskClient) Query() *WorkflowTaskQuery {
	return &WorkflowTaskQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWorkflowTask},
		inters: c.Interceptors(),
	}
}

// Get returns a WorkflowTask entity by its id.
func (c *WorkflowTaskClient) Get(ctx context.Context, id int) (*WorkflowTask, error) {
	return c.Query().Where(workflowtask.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WorkflowTaskClient) GetX(ctx context.Context, id int) *WorkflowTask {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryEvents queries the events edge of a WorkflowTask.
func (c *WorkflowTaskClient) QueryEvents(_m *WorkflowTask) *WorkflowTaskEventQuery {
	query := (&WorkflowTaskEventClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(workflowtask.Table, workflowtask.FieldID, id),
			sqlgraph.To(workflowtaskevent.Table, workflowtaskevent.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, workflowtask.EventsTable, workflowtask.EventsColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProcessInstance queries the process_instance edge of a WorkflowTask.
func (c *WorkflowTaskClient) QueryProcessInstance(_m *WorkflowTask) *ProcessInstanceQuery {
	query := (&ProcessInstanceClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(workflowtask.Table, workflowtask.FieldID, id),
			sqlgraph.To(processinstance.Table, processinstance.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, workflowtask.ProcessInstanceTable, workflowtask.ProcessInstanceColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryProcessNodeInstance queries the process_node_instance edge of a WorkflowTask.
func (c *WorkflowTaskClient) QueryProcessNodeInstance(_m *WorkflowTask) *ProcessNodeInstanceQuery {
	query := (&ProcessNodeInstanceClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(workflowtask.Table, workflowtask.FieldID, id),
			sqlgraph.To(processnodeinstance.Table, processnodeinstance.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, workflowtask.ProcessNodeInstanceTable, workflowtask.ProcessNodeInstanceColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *WorkflowTaskClient) Hooks() []Hook {
	hooks := c.hooks.WorkflowTask
	return append(hooks[:len(hooks):len(hooks)], workflowtask.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *WorkflowTaskClient) Interceptors() []Interceptor {
	return c.inters.WorkflowTask
}

func (c *WorkflowTaskClient) mutate(ctx context.Context, m *WorkflowTaskMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WorkflowTaskCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WorkflowTaskUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WorkflowTaskUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WorkflowTaskDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown WorkflowTask mutation op: %q", m.Op())
	}
}

// WorkflowTaskEventClient is a client for the WorkflowTaskEvent schema.
type WorkflowTaskEventClient struct {
	config
}

// NewWorkflowTaskEventClient returns a client for the WorkflowTaskEvent from the given config.
func NewWorkflowTaskEventClient(c config) *WorkflowTaskEventClient {
	return &WorkflowTaskEventClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `workflowtaskevent.Hooks(f(g(h())))`.
func (c *WorkflowTaskEventClient) Use(hooks ...Hook) {
	c.hooks.WorkflowTaskEvent = append(c.hooks.WorkflowTaskEvent, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `workflowtaskevent.Intercept(f(g(h())))`.
func (c *WorkflowTaskEventClient) Intercept(interceptors ...Interceptor) {
	c.inters.WorkflowTaskEvent = append(c.inters.WorkflowTaskEvent, interceptors...)
}

// Create returns a builder for creating a WorkflowTaskEvent entity.
func (c *WorkflowTaskEventClient) Create() *WorkflowTaskEventCreate {
	mutation := newWorkflowTaskEventMutation(c.config, OpCreate)
	return &WorkflowTaskEventCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WorkflowTaskEvent entities.
func (c *WorkflowTaskEventClient) CreateBulk(builders ...*WorkflowTaskEventCreate) *WorkflowTaskEventCreateBulk {
	return &WorkflowTaskEventCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WorkflowTaskEventClient) MapCreateBulk(slice any, setFunc func(*WorkflowTaskEventCreate, int)) *WorkflowTaskEventCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WorkflowTaskEventCreateBulk{err: fmt.Errorf("calling to WorkflowTaskEventClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WorkflowTaskEventCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WorkflowTaskEventCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WorkflowTaskEvent.
func (c *WorkflowTaskEventClient) Update() *WorkflowTaskEventUpdate {
	mutation := newWorkflowTaskEventMutation(c.config, OpUpdate)
	return &WorkflowTaskEventUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WorkflowTaskEventClient) UpdateOne(_m *WorkflowTaskEvent) *WorkflowTaskEventUpdateOne {
	mutation := newWorkflowTaskEventMutation(c.config, OpUpdateOne, withWorkflowTaskEvent(_m))
	return &WorkflowTaskEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WorkflowTaskEventClient) UpdateOneID(id int) *WorkflowTaskEventUpdateOne {
	mutation := newWorkflowTaskEventMutation(c.config, OpUpdateOne, withWorkflowTaskEventID(id))
	return &WorkflowTaskEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WorkflowTaskEvent.
func (c *WorkflowTaskEventClient) Delete() *WorkflowTaskEventDelete {
	mutation := newWorkflowTaskEventMutation(c.config, OpDelete)
	return &WorkflowTaskEventDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WorkflowTaskEventClient) DeleteOne(_m *WorkflowTaskEvent) *WorkflowTaskEventDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WorkflowTaskEventClient) DeleteOneID(id int) *WorkflowTaskEventDeleteOne {
	builder := c.Delete().Where(workflowtaskevent.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WorkflowTaskEventDeleteOne{builder}
}

// Query returns a query builder for WorkflowTaskEvent.
func (c *WorkflowTaskEventClient) Query() *WorkflowTaskEventQuery {
	return &WorkflowTaskEventQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWorkflowTaskEvent},
		inters: c.Interceptors(),
	}
}

// Get returns a WorkflowTaskEvent entity by its id.
func (c *WorkflowTaskEventClient) Get(ctx context.Context, id int) (*WorkflowTaskEvent, error) {
	return c.Query().Where(workflowtaskevent.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WorkflowTaskEventClient) GetX(ctx context.Context, id int) *WorkflowTaskEvent {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryTask queries the task edge of a WorkflowTaskEvent.
func (c *WorkflowTaskEventClient) QueryTask(_m *WorkflowTaskEvent) *WorkflowTaskQuery {
	query := (&WorkflowTaskClient{config: c.config}).Query()
	query.path = func(context.Context) (fromV *sql.Selector, _ error) {
		id := _m.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(workflowtaskevent.Table, workflowtaskevent.FieldID, id),
			sqlgraph.To(workflowtask.Table, workflowtask.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, workflowtaskevent.TaskTable, workflowtaskevent.TaskColumn),
		)
		fromV = sqlgraph.Neighbors(_m.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *WorkflowTaskEventClient) Hooks() []Hook {
	hooks := c.hooks.WorkflowTaskEvent
	return append(hooks[:len(hooks):len(hooks)], workflowtaskevent.Hooks[:]...)
}

// Interceptors returns the client interceptors.
func (c *WorkflowTaskEventClient) Interceptors() []Interceptor {
	return c.inters.WorkflowTaskEvent
}

func (c *WorkflowTaskEventClient) mutate(ctx context.Context, m *WorkflowTaskEventMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WorkflowTaskEventCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WorkflowTaskEventUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WorkflowTaskEventUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WorkflowTaskEventDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown WorkflowTaskEvent mutation op: %q", m.Op())
	}
}

// WorkflowTaskNumberCounterClient is a client for the WorkflowTaskNumberCounter schema.
type WorkflowTaskNumberCounterClient struct {
	config
}

// NewWorkflowTaskNumberCounterClient returns a client for the WorkflowTaskNumberCounter from the given config.
func NewWorkflowTaskNumberCounterClient(c config) *WorkflowTaskNumberCounterClient {
	return &WorkflowTaskNumberCounterClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `workflowtasknumbercounter.Hooks(f(g(h())))`.
func (c *WorkflowTaskNumberCounterClient) Use(hooks ...Hook) {
	c.hooks.WorkflowTaskNumberCounter = append(c.hooks.WorkflowTaskNumberCounter, hooks...)
}

// Intercept adds a list of query interceptors to the interceptors stack.
// A call to `Intercept(f, g, h)` equals to `workflowtasknumbercounter.Intercept(f(g(h())))`.
func (c *WorkflowTaskNumberCounterClient) Intercept(interceptors ...Interceptor) {
	c.inters.WorkflowTaskNumberCounter = append(c.inters.WorkflowTaskNumberCounter, interceptors...)
}

// Create returns a builder for creating a WorkflowTaskNumberCounter entity.
func (c *WorkflowTaskNumberCounterClient) Create() *WorkflowTaskNumberCounterCreate {
	mutation := newWorkflowTaskNumberCounterMutation(c.config, OpCreate)
	return &WorkflowTaskNumberCounterCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WorkflowTaskNumberCounter entities.
func (c *WorkflowTaskNumberCounterClient) CreateBulk(builders ...*WorkflowTaskNumberCounterCreate) *WorkflowTaskNumberCounterCreateBulk {
	return &WorkflowTaskNumberCounterCreateBulk{config: c.config, builders: builders}
}

// MapCreateBulk creates a bulk creation builder from the given slice. For each item in the slice, the function creates
// a builder and applies setFunc on it.
func (c *WorkflowTaskNumberCounterClient) MapCreateBulk(slice any, setFunc func(*WorkflowTaskNumberCounterCreate, int)) *WorkflowTaskNumberCounterCreateBulk {
	rv := reflect.ValueOf(slice)
	if rv.Kind() != reflect.Slice {
		return &WorkflowTaskNumberCounterCreateBulk{err: fmt.Errorf("calling to WorkflowTaskNumberCounterClient.MapCreateBulk with wrong type %T, need slice", slice)}
	}
	builders := make([]*WorkflowTaskNumberCounterCreate, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		builders[i] = c.Create()
		setFunc(builders[i], i)
	}
	return &WorkflowTaskNumberCounterCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WorkflowTaskNumberCounter.
func (c *WorkflowTaskNumberCounterClient) Update() *WorkflowTaskNumberCounterUpdate {
	mutation := newWorkflowTaskNumberCounterMutation(c.config, OpUpdate)
	return &WorkflowTaskNumberCounterUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WorkflowTaskNumberCounterClient) UpdateOne(_m *WorkflowTaskNumberCounter) *WorkflowTaskNumberCounterUpdateOne {
	mutation := newWorkflowTaskNumberCounterMutation(c.config, OpUpdateOne, withWorkflowTaskNumberCounter(_m))
	return &WorkflowTaskNumberCounterUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WorkflowTaskNumberCounterClient) UpdateOneID(id string) *WorkflowTaskNumberCounterUpdateOne {
	mutation := newWorkflowTaskNumberCounterMutation(c.config, OpUpdateOne, withWorkflowTaskNumberCounterID(id))
	return &WorkflowTaskNumberCounterUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WorkflowTaskNumberCounter.
func (c *WorkflowTaskNumberCounterClient) Delete() *WorkflowTaskNumberCounterDelete {
	mutation := newWorkflowTaskNumberCounterMutation(c.config, OpDelete)
	return &WorkflowTaskNumberCounterDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WorkflowTaskNumberCounterClient) DeleteOne(_m *WorkflowTaskNumberCounter) *WorkflowTaskNumberCounterDeleteOne {
	return c.DeleteOneID(_m.ID)
}

// DeleteOneID returns a builder for deleting the given entity by its id.
func (c *WorkflowTaskNumberCounterClient) DeleteOneID(id string) *WorkflowTaskNumberCounterDeleteOne {
	builder := c.Delete().Where(workflowtasknumbercounter.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WorkflowTaskNumberCounterDeleteOne{builder}
}

// Query returns a query builder for WorkflowTaskNumberCounter.
func (c *WorkflowTaskNumberCounterClient) Query() *WorkflowTaskNumberCounterQuery {
	return &WorkflowTaskNumberCounterQuery{
		config: c.config,
		ctx:    &QueryContext{Type: TypeWorkflowTaskNumberCounter},
		inters: c.Interceptors(),
	}
}

// Get returns a WorkflowTaskNumberCounter entity by its id.
func (c *WorkflowTaskNumberCounterClient) Get(ctx context.Context, id string) (*WorkflowTaskNumberCounter, error) {
	return c.Query().Where(workflowtasknumbercounter.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WorkflowTaskNumberCounterClient) GetX(ctx context.Context, id string) *WorkflowTaskNumberCounter {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// Hooks returns the client hooks.
func (c *WorkflowTaskNumberCounterClient) Hooks() []Hook {
	return c.hooks.WorkflowTaskNumberCounter
}

// Interceptors returns the client interceptors.
func (c *WorkflowTaskNumberCounterClient) Interceptors() []Interceptor {
	return c.inters.WorkflowTaskNumberCounter
}

func (c *WorkflowTaskNumberCounterClient) mutate(ctx context.Context, m *WorkflowTaskNumberCounterMutation) (Value, error) {
	switch m.Op() {
	case OpCreate:
		return (&WorkflowTaskNumberCounterCreate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdate:
		return (&WorkflowTaskNumberCounterUpdate{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpUpdateOne:
		return (&WorkflowTaskNumberCounterUpdateOne{config: c.config, hooks: c.Hooks(), mutation: m}).Save(ctx)
	case OpDelete, OpDeleteOne:
		return (&WorkflowTaskNumberCounterDelete{config: c.config, hooks: c.Hooks(), mutation: m}).Exec(ctx)
	default:
		return nil, fmt.Errorf("ent: unknown WorkflowTaskNumberCounter mutation op: %q", m.Op())
	}
}

// hooks and interceptors per client, for fast access.
type (
	hooks struct {
		AccessEntitlement, AdminSession, AdminUser, AdminUserRole, BOMHeader, BOMItem,
		BusinessAttachment, Contact, Customer, CustomerConfigRevision,
		DeploymentModuleState, EngineeringMaterialRequest,
		EngineeringMaterialRequestItem, FinanceAllocation, FinanceCreditNote,
		FinanceFact, FinancePayment, HelpFeedback, HelpSupplement,
		HelpSupplementRevision, InventoryBalance, InventoryLot,
		InventoryLotStatusEvent, InventoryOperation, InventoryOperationItem,
		InventoryTxn, Material, OutsourcingFact, OutsourcingOrder,
		OutsourcingOrderItem, OutsourcingReturnDisposition, PaymentMethodPreference,
		Permission, Process, ProcessInstance, ProcessNodeInstance, Product, ProductSKU,
		ProductionExceptionDecision, ProductionFact, ProductionOrder,
		ProductionOrderEvent, ProductionOrderItem, ProductionOrderMaterialRequirement,
		ProductionOrderOperation, ProductionPackagingConfirmation, ProductionWIPBatch,
		ProductionWIPEvent, ProductionWIPOutsourcingAllocation, PurchaseOrder,
		PurchaseOrderItem, PurchaseReceipt, PurchaseReceiptAdjustment,
		PurchaseReceiptAdjustmentItem, PurchaseReceiptItem,
		PurchaseRejectionDisposition, PurchaseReturn, PurchaseReturnItem,
		QualityInspection, Role, RoleDataScope, RolePermission, RoleProfile,
		RuntimeAuditEvent, RuntimeMarker, SalesOrder, SalesOrderItem, Shipment,
		ShipmentItem, SourceOrderLifecycleEvent, StockReservation, Supplier, Unit,
		Warehouse, WorkPool, WorkPoolMembership, WorkflowBusinessState, WorkflowTask,
		WorkflowTaskEvent, WorkflowTaskNumberCounter []ent.Hook
	}
	inters struct {
		AccessEntitlement, AdminSession, AdminUser, AdminUserRole, BOMHeader, BOMItem,
		BusinessAttachment, Contact, Customer, CustomerConfigRevision,
		DeploymentModuleState, EngineeringMaterialRequest,
		EngineeringMaterialRequestItem, FinanceAllocation, FinanceCreditNote,
		FinanceFact, FinancePayment, HelpFeedback, HelpSupplement,
		HelpSupplementRevision, InventoryBalance, InventoryLot,
		InventoryLotStatusEvent, InventoryOperation, InventoryOperationItem,
		InventoryTxn, Material, OutsourcingFact, OutsourcingOrder,
		OutsourcingOrderItem, OutsourcingReturnDisposition, PaymentMethodPreference,
		Permission, Process, ProcessInstance, ProcessNodeInstance, Product, ProductSKU,
		ProductionExceptionDecision, ProductionFact, ProductionOrder,
		ProductionOrderEvent, ProductionOrderItem, ProductionOrderMaterialRequirement,
		ProductionOrderOperation, ProductionPackagingConfirmation, ProductionWIPBatch,
		ProductionWIPEvent, ProductionWIPOutsourcingAllocation, PurchaseOrder,
		PurchaseOrderItem, PurchaseReceipt, PurchaseReceiptAdjustment,
		PurchaseReceiptAdjustmentItem, PurchaseReceiptItem,
		PurchaseRejectionDisposition, PurchaseReturn, PurchaseReturnItem,
		QualityInspection, Role, RoleDataScope, RolePermission, RoleProfile,
		RuntimeAuditEvent, RuntimeMarker, SalesOrder, SalesOrderItem, Shipment,
		ShipmentItem, SourceOrderLifecycleEvent, StockReservation, Supplier, Unit,
		Warehouse, WorkPool, WorkPoolMembership, WorkflowBusinessState, WorkflowTask,
		WorkflowTaskEvent, WorkflowTaskNumberCounter []ent.Interceptor
	}
)

// ExecContext allows calling the underlying ExecContext method of the driver if it is supported by it.
// See, database/sql#DB.ExecContext for more information.
func (c *config) ExecContext(ctx context.Context, query string, args ...any) (stdsql.Result, error) {
	ex, ok := c.driver.(interface {
		ExecContext(context.Context, string, ...any) (stdsql.Result, error)
	})
	if !ok {
		return nil, fmt.Errorf("Driver.ExecContext is not supported")
	}
	return ex.ExecContext(ctx, query, args...)
}

// QueryContext allows calling the underlying QueryContext method of the driver if it is supported by it.
// See, database/sql#DB.QueryContext for more information.
func (c *config) QueryContext(ctx context.Context, query string, args ...any) (*stdsql.Rows, error) {
	q, ok := c.driver.(interface {
		QueryContext(context.Context, string, ...any) (*stdsql.Rows, error)
	})
	if !ok {
		return nil, fmt.Errorf("Driver.QueryContext is not supported")
	}
	return q.QueryContext(ctx, query, args...)
}
