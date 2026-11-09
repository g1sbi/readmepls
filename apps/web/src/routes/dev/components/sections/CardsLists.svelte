<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Button } from "$lib/components/ui/button";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import SourcePill from "$lib/components/ui/SourcePill.svelte";
  import CollectionFolder from "$lib/components/ui/CollectionFolder.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  const base = {
    url: "https://example.com/essay",
    expand: {
      content: {
        extract_status: "ok",
        title: "A long essay about reading slowly on small screens",
        ai_tags_json: ["reading", "design"],
      },
    },
  };
  const articles = [
    { label: "Ok", article: { ...base, id: "ok", progress: 0.4 } },
    {
      label: "Processing",
      article: { id: "proc", url: base.url },
    },
    {
      label: "Failed",
      article: {
        id: "fail",
        url: base.url,
        expand: {
          content: {
            extract_status: "failed",
            title: "Couldn't read this one",
            failure_reason: "The page blocked extraction.",
          },
        },
      },
    },
    { label: "Archived", article: { ...base, id: "arch", status: "archived" } },
  ];
  const noop = () => {};
  let open = $state(true);
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Card</h4>
    <Card.Root>
      <Card.Header>
        <Card.Title>Static card</Card.Title>
        <Card.Description>Hairline ring, 16px radius.</Card.Description>
      </Card.Header>
    </Card.Root>
    <Card.Root interactive>
      <Card.Header>
        <Card.Title>Interactive card</Card.Title>
        <Card.Description>Lifts on hover with a fine pointer.</Card.Description>
      </Card.Header>
    </Card.Root>
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Article card</h4>
    {#each articles as { label, article } (article.id)}
      <p class="text-muted-foreground text-xs">{label}</p>
      <ArticleCard
        {article}
        collections={[{ id: "c1", name: "Read later" }]}
        onRetry={noop}
        onDelete={noop}
        onAddToCollection={noop}
        onArchive={noop}
        onUnarchive={noop}
      />
    {/each}
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Card grid</h4>
    <CardGrid>
      {#each [1, 2, 3] as n (n)}
        <Card.Root><Card.Title>Item {n}</Card.Title></Card.Root>
      {/each}
    </CardGrid>
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Source pill</h4>
    <SourcePill name="Example Journal" host="example.com" />
    <SourcePill host="a-rather-long-hostname.example.org" />
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Collection folder</h4>
    <CollectionFolder name="Read later" slug="read-later" count={12} />
  </div>

  <div class="flex flex-col gap-3">
    <h4 class="text-muted-foreground text-xs font-medium">Collapsible</h4>
    <Collapsible.Root bind:open>
      <Collapsible.Trigger>
        {#snippet child({ props })}
          <Button variant="outline" {...props}>
            {open ? "Hide details" : "Show details"}
          </Button>
        {/snippet}
      </Collapsible.Trigger>
      <Collapsible.Content>
        <p class="text-muted-foreground pt-2 text-sm">Hidden details.</p>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
</div>
