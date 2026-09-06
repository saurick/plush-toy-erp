export function findSalesOrderAcceptanceExecution(data, expected) {
  const node = data?.completed_node;
  const matchingNode = Array.isArray(data?.nodes)
    ? data.nodes.find(
        (candidate) =>
          candidate?.id === node?.id &&
          Number(candidate.process_instance_id) === expected.instanceID &&
          candidate.node_key === "submit_sales_order" &&
          candidate.node_type === "domain_command" &&
          candidate.status === "completed" &&
          candidate.version === node?.version,
      )
    : undefined;
  if (
    Number(node?.id) !== expected.nodeID ||
    Number(node?.process_instance_id) !== expected.instanceID ||
    node?.node_key !== "submit_sales_order" ||
    node?.node_type !== "domain_command" ||
    node?.status !== "completed" ||
    node?.outcome !== "sales_order.submitted" ||
    Number(node?.version) !== expected.version + 1 ||
    !matchingNode
  ) {
    return null;
  }
  return node;
}
