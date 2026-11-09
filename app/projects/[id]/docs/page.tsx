import DocsClient from "./docs-client";

export default async function DocsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocsClient projectId={id} />;
}
