import Reg2569Client from "./reg2569-client";

export default async function Reg2569Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Reg2569Client projectId={id} />;
}
