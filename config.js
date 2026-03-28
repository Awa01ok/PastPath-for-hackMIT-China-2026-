function buildConfig(person) {
    const generatedChapters = (person.events || []).map(event => {
        const wikiSource = (event.sources || []).find(source => {
            if (typeof source === 'string') {
                return source.includes('wikipedia.org');
            }
            return source && typeof source.url === 'string' && source.url.includes('wikipedia.org');
        });

        const wikiUrl = typeof wikiSource === 'string'
            ? wikiSource
            : (wikiSource && wikiSource.url) || '';

        return {
            id: event.id,
            alignment: 'right',
            title: event.title,
            description: event.description,
            image: event.image || '',
            wikiUrl: wikiUrl,
            dateStart: event.dateStart || '',
            year: event.year || null,
            timelineKey: event.timelineKey || null,
            territoryKey: event.territoryKey || null,
            location: {
                center: event.center,
                zoom: event.zoom,
                pitch: event.pitch,
                bearing: event.bearing
            },
            onChapterEnter: [],
            onChapterExit: []
        };
    });

    return {
        style: '/assets/map-styles/pastpath-archive-clean.json',
        showMarkers: true,
        markerColor: '#3FB1CE',
        inset: true,
        insetStyle: '/assets/map-styles/pastpath-archive-clean.json',
        insetPosition: 'bottom-right',
        insetZoom: 1,
        insetOptions: {
            markerColor: 'orange'
        },
        theme: 'dark',
        use3dTerrain: false,
        auto: false,
        title: 'WWII Biography Story Map',
        subtitle: `${person.name || ''}${person.years ? ' · ' + person.years : ''}`,
        byline: person.summary || '',
        footer: 'Created for HackMIT using the MapLibre Storytelling template.',
        chapters: generatedChapters
    };
}
