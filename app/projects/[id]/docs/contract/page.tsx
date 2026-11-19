import ContractClient from "./contract-client";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContractClient projectId={id} />;
}
