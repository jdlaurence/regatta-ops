/// <reference path="../pb_data/types.d.ts" />
// Athletes no longer carry a weight (the owner: "We don't really do weight stuff anymore").
//
// - athletes.weight_kg is removed, with whatever it held. Shells keep their own weight fields
//   (hull weight_kg, weight_class_label, crew_weight_min_kg / crew_weight_max_kg): they describe
//   the boat, not the crew in it.
// - Reverting puts the field back in its old place (after can_cox), empty.

migrate(
  (app) => {
    const athletes = app.findCollectionByNameOrId('srt_athletes');
    athletes.fields.removeByName('weight_kg');
    app.save(athletes);
  },
  (app) => {
    const athletes = app.findCollectionByNameOrId('srt_athletes');
    // id, team, first_name, last_name, preferred_name, side, can_scull, can_cox, weight_kg
    athletes.fields.addAt(
      8,
      new Field({
        id: 'athletes__weight_kg',
        type: 'number',
        name: 'weight_kg',
        min: 0,
      }),
    );
    app.save(athletes);
  },
);
