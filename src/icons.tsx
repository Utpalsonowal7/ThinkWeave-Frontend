export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    back: 'M19 12H5m6-6-6 6 6 6',
    note: 'M4 3h16v12l-5 6H4zM14 21v-7h6',
    document: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',
    shape: 'm12 2 10 10-10 10L2 12Z',
    task: 'M4 4h16v16H4zM8 12l3 3 5-6',
    group: 'M3 6h7l2 3h9v12H3z',
    comment: 'M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0ZM7 9h10M7 13h7',
    spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4',
    history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    logout: 'M9 3H3v18h6M8 12h13m-5-5 5 5-5 5',
    close: 'm6 6 12 12M6 18 18 6',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    undo: 'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4',
    redo: 'm16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7v4',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    check: 'm5 12 4 4L19 6',
    people:
      'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M13 4a4 4 0 1 1 0 8M22 21v-3a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    link: 'm10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 8l2-2a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    save: 'M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
