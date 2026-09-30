/// <reference path="../pb_data/types.d.ts" />
// Compartments as zones along the trailer's length (PLAN.md §4.9, §8.1).
//
// trailer_compartments.start_cm / end_cm: where the compartment sits along the frame, cm from the
// front, across the bed's full width (SRA's riggers fill the back of the bed). PocketBase has no
// null number, so 0 reads as blank: a blank start is the front, a blank end the back of the
// frame, and both blank (every compartment before this migration) means the whole length.

migrate(
  (app) => {
    const compartments = app.findCollectionByNameOrId('srt_trailer_compartments');
    compartments.fields.add(
      new Field({
        id: 'trailer_compartments__start_cm',
        type: 'number',
        name: 'start_cm',
        min: 0,
      }),
    );
    compartments.fields.add(
      new Field({
        id: 'trailer_compartments__end_cm',
        type: 'number',
        name: 'end_cm',
        min: 0,
      }),
    );
    app.save(compartments);
  },
  (app) => {
    const compartments = app.findCollectionByNameOrId('srt_trailer_compartments');
    compartments.fields.removeByName('start_cm');
    compartments.fields.removeByName('end_cm');
    app.save(compartments);
  },
);
