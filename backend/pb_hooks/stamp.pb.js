/// <reference path="../pb_data/types.d.ts" />
// Authorship stamps (PLAN.md §8.3). For requests by a signed-in user, the server decides who did
// it; client-supplied values are ignored. Superuser requests (the seed) keep what they send.
//
//   regattas        created_by on create; unchanged afterwards
//   entries         created_by on create, updated_by on every write
//   availability    updated_by on every write
//   comments        author on create; unchanged afterwards
//   presence        user on create; unchanged afterwards
//   load_items      loaded_by / returned_by follow loaded_at / returned_at; the share-link
//                   names (loaded_by_name / returned_by_name) clear when a signed-in user
//                   changes the matching time
//
// Handlers run in isolated scopes, so each one computes the user id itself.

onRecordCreateRequest(
  (e) => {
    if (e.hasSuperuserAuth()) return e.next();
    const me = e.auth && e.auth.collection().name === 'users' ? e.auth.id : '';
    const r = e.record;
    switch (e.collection.name) {
      case 'regattas':
        r.set('created_by', me);
        break;
      case 'entries':
        r.set('created_by', me);
        r.set('updated_by', me);
        break;
      case 'availability':
        r.set('updated_by', me);
        break;
      case 'comments':
        r.set('author', me);
        break;
      case 'presence':
        r.set('user', me);
        break;
      case 'load_items':
        r.set('loaded_by', r.getString('loaded_at') ? me : '');
        r.set('returned_by', r.getString('returned_at') ? me : '');
        r.set('loaded_by_name', '');
        r.set('returned_by_name', '');
        break;
    }
    e.next();
  },
  'regattas',
  'entries',
  'availability',
  'comments',
  'presence',
  'load_items',
);

onRecordUpdateRequest(
  (e) => {
    if (e.hasSuperuserAuth()) return e.next();
    const me = e.auth && e.auth.collection().name === 'users' ? e.auth.id : '';
    const r = e.record;
    const o = r.original();
    switch (e.collection.name) {
      case 'regattas':
        r.set('created_by', o.getString('created_by'));
        break;
      case 'entries':
        r.set('created_by', o.getString('created_by'));
        r.set('updated_by', me);
        break;
      case 'availability':
        r.set('updated_by', me);
        break;
      case 'comments':
        r.set('author', o.getString('author'));
        break;
      case 'presence':
        r.set('user', o.getString('user'));
        break;
      case 'load_items':
        if (r.getString('loaded_at') !== o.getString('loaded_at')) {
          r.set('loaded_by', r.getString('loaded_at') ? me : '');
          r.set('loaded_by_name', '');
        } else {
          r.set('loaded_by', o.getString('loaded_by'));
          r.set('loaded_by_name', o.getString('loaded_by_name'));
        }
        if (r.getString('returned_at') !== o.getString('returned_at')) {
          r.set('returned_by', r.getString('returned_at') ? me : '');
          r.set('returned_by_name', '');
        } else {
          r.set('returned_by', o.getString('returned_by'));
          r.set('returned_by_name', o.getString('returned_by_name'));
        }
        break;
    }
    e.next();
  },
  'regattas',
  'entries',
  'availability',
  'comments',
  'presence',
  'load_items',
);
