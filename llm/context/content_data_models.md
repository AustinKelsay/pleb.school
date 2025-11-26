model Course {
    id          String       @id
    userId      String
    user        User         @relation(fields: [userId], references: [id])
    price       Int          @default(0)
    lessons     Lesson[]
    purchases   Purchase[]
    noteId      String?      @unique
    submissionRequired Boolean @default(false)
    createdAt   DateTime     @default(now())
    updatedAt   DateTime     @updatedAt
    userCourses UserCourse[]
    badge       Badge?
}


model Resource {
    id           String        @id // Client generates UUID
    userId       String
    user         User          @relation(fields: [userId], references: [id])
    lessons      Lesson[]
    draftLessons DraftLesson[]
    price        Int           @default(0)
    purchases    Purchase[]
    noteId       String?       @unique
    videoId      String?
    createdAt    DateTime      @default(now())
    updatedAt    DateTime      @updatedAt
}

model Lesson {
    id          String       @id @default(uuid())
    courseId    String?
    course      Course?      @relation(fields: [courseId], references: [id])
    resourceId  String?
    resource    Resource?    @relation(fields: [resourceId], references: [id])
    draftId     String?
    draft       Draft?       @relation(fields: [draftId], references: [id])
    index       Int
    createdAt   DateTime     @default(now())
    updatedAt   DateTime     @updatedAt
    userLessons UserLesson[]
}

export const parseCourseEvent = event => {
  // Initialize an object to store the extracted data
  const eventData = {
    id: event.id,
    pubkey: event.pubkey || '',
    content: event.content || '',
    kind: event.kind || '',
    name: '',
    description: '',
    image: '',
    published_at: '',
    created_at: event.created_at,
    topics: [],
    d: '',
    tags: event.tags,
    type: 'course',
  };

  // Iterate over the tags array to extract data
  event.tags.forEach(tag => {
    switch (
      tag[0] // Check the key in each key-value pair
    ) {
      case 'name':
        eventData.name = tag[1];
        break;
      case 'title':
        eventData.name = tag[1];
        break;
      case 'description':
        eventData.description = tag[1];
        break;
      case 'about':
        eventData.description = tag[1];
        break;
      case 'image':
        eventData.image = tag[1];
        break;
      case 'picture':
        eventData.image = tag[1];
        break;
      case 'published_at':
        eventData.published_at = tag[1];
        break;
      case 'd':
        eventData.d = tag[1];
        break;
      case 'price':
        eventData.price = tag[1];
        break;
      // How do we get topics / tags?
      case 'l':
        // Grab index 1 and any subsequent elements in the array
        tag.slice(1).forEach(topic => {
          eventData.topics.push(topic);
        });
        break;
      case 'r':
        eventData.additionalLinks.push(tag[1]);
        break;
      case 't':
        eventData.topics.push(tag[1]);
        break;
      default:
        break;
    }
  });

  return eventData;
};


export const parseEvent = event => {
  // Initialize an object to store the extracted data
  const eventData = {
    id: event.id,
    pubkey: event.pubkey || '',
    content: event.content || '',
    kind: event.kind || '',
    additionalLinks: [],
    title: '',
    summary: '',
    image: '',
    published_at: '',
    topics: [], // Added to hold all topics
    type: 'document', // Default type
  };

  // Iterate over the tags array to extract data
  event.tags.forEach(tag => {
    switch (
      tag[0] // Check the key in each key-value pair
    ) {
      case 'title':
        eventData.title = tag[1];
        break;
      case 'summary':
        eventData.summary = tag[1];
        break;
      case 'description':
        eventData.summary = tag[1];
        break;
      case 'name':
        eventData.title = tag[1];
        break;
      case 'image':
        eventData.image = tag[1];
        break;
      case 'published_at':
        eventData.published_at = tag[1];
        break;
      case 'author':
        eventData.author = tag[1];
        break;
      case 'price':
        eventData.price = tag[1];
        break;
      // How do we get topics / tags?
      case 'l':
        // Grab index 1 and any subsequent elements in the array
        tag.slice(1).forEach(topic => {
          eventData.topics.push(topic);
        });
        break;
      case 'd':
        eventData.d = tag[1];
        break;
      case 't':
        if (tag[1] === 'video') {
          eventData.type = 'video';
          eventData.topics.push(tag[1]);
        } else if (!['plebdevs', 'plebschool'].includes(tag[1] || '')) {
          eventData.topics.push(tag[1]);
        }
        break;
      case 'r':
        eventData.additionalLinks.push(tag[1]);
        break;
      default:
        break;
    }
  });

  // if published_at is an empty string, then set it to event.created_at
  if (!eventData.published_at) {
    eventData.published_at = event.created_at;
  }

  return eventData;
};

NIP-01
======

Basic protocol flow description
-------------------------------

`draft` `mandatory`

This NIP defines the basic protocol that should be implemented by everybody. New NIPs may add new optional (or mandatory) fields and messages and features to the structures and flows described here.

## Events and signatures

Each user has a keypair. Signatures, public key, and encodings are done according to the [Schnorr signatures standard for the curve `secp256k1`](https://bips.xyz/340).

The only object type that exists is the `event`, which has the following format on the wire:

```yaml
{
  "id": <32-bytes lowercase hex-encoded sha256 of the serialized event data>,
  "pubkey": <32-bytes lowercase hex-encoded public key of the event creator>,
  "created_at": <unix timestamp in seconds>,
  "kind": <integer between 0 and 65535>,
  "tags": [
    [<arbitrary string>...],
    // ...
  ],
  "content": <arbitrary string>,
  "sig": <64-bytes lowercase hex of the signature of the sha256 hash of the serialized event data, which is the same as the "id" field>
}
```

To obtain the `event.id`, we `sha256` the serialized event. The serialization is done over the UTF-8 JSON-serialized string (which is described below) of the following structure:

```
[
  0,
  <pubkey, as a lowercase hex string>,
  <created_at, as a number>,
  <kind, as a number>,
  <tags, as an array of arrays of non-null strings>,
  <content, as a string>
]
```

To prevent implementation differences from creating a different event ID for the same event, the following rules MUST be followed while serializing:
- UTF-8 should be used for encoding.
- Whitespace, line breaks or other unnecessary formatting should not be included in the output JSON.
- The following characters in the content field must be escaped as shown, and all other characters must be included verbatim:
  - A line break (`0x0A`), use `\n`
  - A double quote (`0x22`), use `\"`
  - A backslash (`0x5C`), use `\\`
  - A carriage return (`0x0D`), use `\r`
  - A tab character (`0x09`), use `\t`
  - A backspace, (`0x08`), use `\b`
  - A form feed, (`0x0C`), use `\f`

### Tags

Each tag is an array of one or more strings, with some conventions around them. Take a look at the example below:

```jsonc
{
  "tags": [
    ["e", "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36", "wss://nostr.example.com"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"],
    ["a", "30023:f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca:abcd", "wss://nostr.example.com"],
    ["alt", "reply"],
    // ...
  ],
  // ...
}
```

The first element of the tag array is referred to as the tag _name_ or _key_ and the second as the tag _value_. So we can safely say that the event above has an `e` tag set to `"5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36"`, an `alt` tag set to `"reply"` and so on. All elements after the second do not have a conventional name.

This NIP defines 3 standard tags that can be used across all event kinds with the same meaning. They are as follows:

- The `e` tag, used to refer to an event: `["e", <32-bytes lowercase hex of the id of another event>, <recommended relay URL, optional>, <32-bytes lowercase hex of the author's pubkey, optional>]`
- The `p` tag, used to refer to another user: `["p", <32-bytes lowercase hex of a pubkey>, <recommended relay URL, optional>]`
- The `a` tag, used to refer to an addressable or replaceable event
    - for an addressable event: `["a", "<kind integer>:<32-bytes lowercase hex of a pubkey>:<d tag value>", <recommended relay URL, optional>]`
    - for a normal replaceable event: `["a", "<kind integer>:<32-bytes lowercase hex of a pubkey>:", <recommended relay URL, optional>]` (note: include the trailing colon)

As a convention, all single-letter (only english alphabet letters: a-z, A-Z) key tags are expected to be indexed by relays, such that it is possible, for example, to query or subscribe to events that reference the event `"5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36"` by using the `{"#e": ["5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36"]}` filter. Only the first value in any given tag is indexed.

### Kinds

Kinds specify how clients should interpret the meaning of each event and the other fields of each event (e.g. an `"r"` tag may have a meaning in an event of kind 1 and an entirely different meaning in an event of kind 10002). Each NIP may define the meaning of a set of kinds that weren't defined elsewhere. [NIP-10](10.md), for instance, specifies the `kind:1` text note for social media applications.

This NIP defines one basic kind:

- `0`: **user metadata**: the `content` is set to a stringified JSON object `{name: <nickname or full name>, about: <short bio>, picture: <url of the image>}` describing the user who created the event. [Extra metadata fields](24.md#kind-0) may be set. A relay may delete older events once it gets a new one for the same pubkey.

And also a convention for kind ranges that allow for easier experimentation and flexibility of relay implementation:

- for kind `n` such that `1000 <= n < 10000 || 4 <= n < 45 || n == 1 || n == 2`, events are **regular**, which means they're all expected to be stored by relays.
- for kind `n` such that `10000 <= n < 20000 || n == 0 || n == 3`, events are **replaceable**, which means that, for each combination of `pubkey` and `kind`, only the latest event MUST be stored by relays, older versions MAY be discarded.
- for kind `n` such that `20000 <= n < 30000`, events are **ephemeral**, which means they are not expected to be stored by relays.
- for kind `n` such that `30000 <= n < 40000`, events are **addressable** by their `kind`, `pubkey` and `d` tag value -- which means that, for each combination of `kind`, `pubkey` and the `d` tag value, only the latest event MUST be stored by relays, older versions MAY be discarded.

In case of replaceable events with the same timestamp, the event with the lowest id (first in lexical order) should be retained, and the other discarded.

When answering to `REQ` messages for replaceable events such as `{"kinds":[0],"authors":[<hex-key>]}`, even if the relay has more than one version stored, it SHOULD return just the latest one.

These are just conventions and relay implementations may differ.

## Communication between clients and relays

Relays expose a websocket endpoint to which clients can connect. Clients SHOULD open a single websocket connection to each relay and use it for all their subscriptions. Relays MAY limit number of connections from specific IP/client/etc.

### From client to relay: sending events and creating subscriptions

Clients can send 3 types of messages, which must be JSON arrays, according to the following patterns:

  * `["EVENT", <event JSON as defined above>]`, used to publish events.
  * `["REQ", <subscription_id>, <filters1>, <filters2>, ...]`, used to request events and subscribe to new updates.
  * `["CLOSE", <subscription_id>]`, used to stop previous subscriptions.

`<subscription_id>` is an arbitrary, non-empty string of max length 64 chars. It represents a subscription per connection. Relays MUST manage `<subscription_id>`s independently for each WebSocket connection. `<subscription_id>`s are not guaranteed to be globally unique.

`<filtersX>` is a JSON object that determines what events will be sent in that subscription, it can have the following attributes:

```yaml
{
  "ids": <a list of event ids>,
  "authors": <a list of lowercase pubkeys, the pubkey of an event must be one of these>,
  "kinds": <a list of a kind numbers>,
  "#<single-letter (a-zA-Z)>": <a list of tag values, for #e — a list of event ids, for #p — a list of pubkeys, etc.>,
  "since": <an integer unix timestamp in seconds. Events must have a created_at >= to this to pass>,
  "until": <an integer unix timestamp in seconds. Events must have a created_at <= to this to pass>,
  "limit": <maximum number of events relays SHOULD return in the initial query>
}
```

Upon receiving a `REQ` message, the relay SHOULD return events that match the filter. Any new events it receives SHOULD be sent to that same websocket until the connection is closed, a `CLOSE` event is received with the same `<subscription_id>`, or a new `REQ` is sent using the same `<subscription_id>` (in which case a new subscription is created, replacing the old one).

Filter attributes containing lists (`ids`, `authors`, `kinds` and tag filters like `#e`) are JSON arrays with one or more values. At least one of the arrays' values must match the relevant field in an event for the condition to be considered a match. For scalar event attributes such as `authors` and `kind`, the attribute from the event must be contained in the filter list. In the case of tag attributes such as `#e`, for which an event may have multiple values, the event and filter condition values must have at least one item in common.

The `ids`, `authors`, `#e` and `#p` filter lists MUST contain exact 64-character lowercase hex values.

The `since` and `until` properties can be used to specify the time range of events returned in the subscription. If a filter includes the `since` property, events with `created_at` greater than or equal to `since` are considered to match the filter. The `until` property is similar except that `created_at` must be less than or equal to `until`. In short, an event matches a filter if `since <= created_at <= until` holds.

All conditions of a filter that are specified must match for an event for it to pass the filter, i.e., multiple conditions are interpreted as `&&` conditions.

A `REQ` message may contain multiple filters. In this case, events that match any of the filters are to be returned, i.e., multiple filters are to be interpreted as `||` conditions.

The `limit` property of a filter is only valid for the initial query and MUST be ignored afterwards. When `limit: n` is present it is assumed that the events returned in the initial query will be the last `n` events ordered by the `created_at`. Newer events should appear first, and in the case of ties the event with the lowest id (first in lexical order) should be first. Relays SHOULD use the `limit` value to guide how many events are returned in the initial response. Returning fewer events is acceptable, but returning (much) more should be avoided to prevent overwhelming clients.

### From relay to client: sending events and notices

Relays can send 5 types of messages, which must also be JSON arrays, according to the following patterns:

  * `["EVENT", <subscription_id>, <event JSON as defined above>]`, used to send events requested by clients.
  * `["OK", <event_id>, <true|false>, <message>]`, used to indicate acceptance or denial of an `EVENT` message.
  * `["EOSE", <subscription_id>]`, used to indicate the _end of stored events_ and the beginning of events newly received in real-time.
  * `["CLOSED", <subscription_id>, <message>]`, used to indicate that a subscription was ended on the server side.
  * `["NOTICE", <message>]`, used to send human-readable error messages or other things to clients.

This NIP defines no rules for how `NOTICE` messages should be sent or treated.

- `EVENT` messages MUST be sent only with a subscription ID related to a subscription previously initiated by the client (using the `REQ` message above).
- `OK` messages MUST be sent in response to `EVENT` messages received from clients, they must have the 3rd parameter set to `true` when an event has been accepted by the relay, `false` otherwise. The 4th parameter MUST always be present, but MAY be an empty string when the 3rd is `true`, otherwise it MUST be a string formed by a machine-readable single-word prefix followed by a `:` and then a human-readable message. Some examples:
  * `["OK", "b1a649ebe8...", true, ""]`
  * `["OK", "b1a649ebe8...", true, "pow: difficulty 25>=24"]`
  * `["OK", "b1a649ebe8...", true, "duplicate: already have this event"]`
  * `["OK", "b1a649ebe8...", false, "blocked: you are banned from posting here"]`
  * `["OK", "b1a649ebe8...", false, "blocked: please register your pubkey at https://my-expensive-relay.example.com"]`
  * `["OK", "b1a649ebe8...", false, "rate-limited: slow down there chief"]`
  * `["OK", "b1a649ebe8...", false, "invalid: event creation date is too far off from the current time"]`
  * `["OK", "b1a649ebe8...", false, "pow: difficulty 26 is less than 30"]`
  * `["OK", "b1a649ebe8...", false, "restricted: not allowed to write."]`
  * `["OK", "b1a649ebe8...", false, "error: could not connect to the database"]`
  * `["OK", "b1a649ebe8...", false, "mute: no one was listening to your ephemeral event and it wasn't handled in any way, it was ignored"]`
- `CLOSED` messages MUST be sent in response to a `REQ` when the relay refuses to fulfill it. It can also be sent when a relay decides to kill a subscription on its side before a client has disconnected or sent a `CLOSE`. This message uses the same pattern of `OK` messages with the machine-readable prefix and human-readable message. Some examples:
  * `["CLOSED", "sub1", "unsupported: filter contains unknown elements"]`
  * `["CLOSED", "sub1", "error: could not connect to the database"]`
  * `["CLOSED", "sub1", "error: shutting down idle subscription"]`
- The standardized machine-readable prefixes for `OK` and `CLOSED` are: `duplicate`, `pow`, `blocked`, `rate-limited`, `invalid`, `restricted`, `mute` and `error` for when none of that fits.


NIP-19
======

bech32-encoded entities
-----------------------

`draft` `optional`

This NIP standardizes bech32-formatted strings that can be used to display keys, ids and other information in clients. These formats are not meant to be used anywhere in the core protocol, they are only meant for displaying to users, copy-pasting, sharing, rendering QR codes and inputting data.

It is recommended that ids and keys are stored in either hex or binary format, since these formats are closer to what must actually be used the core protocol.

## Bare keys and ids

To prevent confusion and mixing between private keys, public keys and event ids, which are all 32 byte strings. bech32-(not-m) encoding with different prefixes can be used for each of these entities.

These are the possible bech32 prefixes:

  - `npub`: public keys
  - `nsec`: private keys
  - `note`: note ids

Example: the hex public key `3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d` translates to `npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6`.

The bech32 encodings of keys and ids are not meant to be used inside the standard NIP-01 event formats or inside the filters, they're meant for human-friendlier display and input only. Clients should still accept keys in both hex and npub format for now, and convert internally.

## Shareable identifiers with extra metadata

When sharing a profile or an event, an app may decide to include relay information and other metadata such that other apps can locate and display these entities more easily.

For these events, the contents are a binary-encoded list of `TLV` (type-length-value), with `T` and `L` being 1 byte each (`uint8`, i.e. a number in the range of 0-255), and `V` being a sequence of bytes of the size indicated by `L`.

These are the possible bech32 prefixes with `TLV`:

  - `nprofile`: a nostr profile
  - `nevent`: a nostr event
  - `naddr`: a nostr _addressable event_ coordinate
  - `nrelay`: a nostr relay (deprecated)

These possible standardized `TLV` types are indicated here:

- `0`: `special`
  - depends on the bech32 prefix:
    - for `nprofile` it will be the 32 bytes of the profile public key
    - for `nevent` it will be the 32 bytes of the event id
    - for `naddr`, it is the identifier (the `"d"` tag) of the event being referenced. For normal replaceable events use an empty string.
- `1`: `relay`
  - for `nprofile`, `nevent` and `naddr`, _optionally_, a relay in which the entity (profile or event) is more likely to be found, encoded as ascii
  - this may be included multiple times
- `2`: `author`
  - for `naddr`, the 32 bytes of the pubkey of the event
  - for `nevent`, _optionally_, the 32 bytes of the pubkey of the event
- `3`: `kind`
  - for `naddr`, the 32-bit unsigned integer of the kind, big-endian
  - for `nevent`, _optionally_, the 32-bit unsigned integer of the kind, big-endian

## Examples

- `npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg` should decode into the public key hex `7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e` and vice-versa
- `nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5` should decode into the private key hex `67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa` and vice-versa
- `nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p` should decode into a profile with the following TLV items:
  - pubkey: `3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d`
  - relay: `wss://r.x.com`
  - relay: `wss://djbas.sadkb.com`

## Notes

- `npub` keys MUST NOT be used in NIP-01 events or in NIP-05 JSON responses, only the hex format is supported there.
- When decoding a bech32-formatted string, TLVs that are not recognized or supported should be ignored, rather than causing an error.


NIP-51
======

Lists
-----

`draft` `optional`

This NIP defines lists of things that users can create. Lists can contain references to anything, and these references can be **public** or **private**.

Public items in a list are specified in the event `tags` array, while private items are specified in a JSON array that mimics the structure of the event `tags` array, but stringified and encrypted using the same scheme from [NIP-04](04.md) (the shared key is computed using the author's public and private key) and stored in the `.content`.

When new items are added to an existing list, clients SHOULD append them to the end of the list, so they are stored in chronological order.

## Types of lists

### Standard lists

Standard lists use normal replaceable events, meaning users may only have a single list of each kind. They have special meaning and clients may rely on them to augment a user's profile or browsing experience.

For example, _mute list_ can contain the public keys of spammers and bad actors users don't want to see in their feeds or receive annoying notifications from.

| name              | kind  | description                                                 | expected tag items                                                                                  |
| ---               | ---   | ---                                                         | ---                                                                                                 |
| Follow list       |     3 | microblogging basic follow list, see [NIP-02](02.md)        | `"p"` (pubkeys -- with optional relay hint and petname)                                             |
| Mute list         | 10000 | things the user doesn't want to see in their feeds          | `"p"` (pubkeys), `"t"` (hashtags), `"word"` (lowercase string), `"e"` (threads)                     |
| Pinned notes      | 10001 | events the user intends to showcase in their profile page   | `"e"` (kind:1 notes)                                                                                |
| Read/write relays | 10002 | where a user publishes to and where they expect mentions    | see [NIP-65](65.md)                                                                                 |
| Bookmarks         | 10003 | uncategorized, "global" list of things a user wants to save | `"e"` (kind:1 notes), `"a"` (kind:30023 articles), `"t"` (hashtags), `"r"` (URLs)                   |
| Communities       | 10004 | [NIP-72](72.md) communities the user belongs to             | `"a"` (kind:34550 community definitions)                                                            |
| Public chats      | 10005 | [NIP-28](28.md) chat channels the user is in                | `"e"` (kind:40 channel definitions)                                                                 |
| Blocked relays    | 10006 | relays clients should never connect to                      | `"relay"` (relay URLs)                                                                              |
| Search relays     | 10007 | relays clients should use when performing search queries    | `"relay"` (relay URLs)                                                                              |
| Simple groups     | 10009 | [NIP-29](29.md) groups the user is in                       | `"group"` ([NIP-29](29.md) group id + relay URL + optional group name), `"r"` for each relay in use |
| Relay feeds       | 10012 | user favorite browsable relays (and relay sets)             | `"relay"` (relay URLs) and `"a"` (kind:30002 relay set)                                             |
| Interests         | 10015 | topics a user may be interested in and pointers             | `"t"` (hashtags) and `"a"` (kind:30015 interest set)                                                |
| Media follows     | 10020 | multimedia (photos, short video) follow list                | `"p"` (pubkeys -- with optional relay hint and petname)                                             |
| Emojis            | 10030 | user preferred emojis and pointers to emoji sets            | `"emoji"` (see [NIP-30](30.md)) and `"a"` (kind:30030 emoji set)                                    |
| DM relays         | 10050 | Where to receive [NIP-17](17.md) direct messages            | `"relay"` (see [NIP-17](17.md))                                                                     |
| Good wiki authors | 10101 | [NIP-54](54.md) user recommended wiki authors               | `"p"` (pubkeys)                                                                                     |
| Good wiki relays  | 10102 | [NIP-54](54.md) relays deemed to only host useful articles  | `"relay"` (relay URLs)                                                                              |

### Sets

Sets are lists with well-defined meaning that can enhance the functionality and the UI of clients that rely on them. Unlike standard lists, users are expected to have more than one set of each kind, therefore each of them must be assigned a different `"d"` identifier.

For example, _relay sets_ can be displayed in a dropdown UI to give users the option to switch to which relays they will publish an event or from which relays they will read the replies to an event; _curation sets_ can be used by apps to showcase curations made by others tagged to different topics.

Aside from their main identifier, the `"d"` tag, sets can optionally have a `"title"`, an `"image"` and a `"description"` tags that can be used to enhance their UI.

| name                  | kind  | description                                                                                  | expected tag items                                                                  |
| ---                   | ---   | ---                                                                                          | ---                                                                                 |
| Follow sets           | 30000 | categorized groups of users a client may choose to check out in different circumstances      | `"p"` (pubkeys)                                                                     |
| Relay sets            | 30002 | user-defined relay groups the user can easily pick and choose from during various operations | `"relay"` (relay URLs)                                                              |
| Bookmark sets         | 30003 | user-defined bookmarks categories , for when bookmarks must be in labeled separate groups    | `"e"` (kind:1 notes), `"a"` (kind:30023 articles), `"t"` (hashtags), `"r"` (URLs)   |
| Curation sets         | 30004 | groups of articles picked by users as interesting and/or belonging to the same category      | `"a"` (kind:30023 articles), `"e"` (kind:1 notes)                                   |
| Curation sets         | 30005 | groups of videos picked by users as interesting and/or belonging to the same category        | `"a"` (kind:21 videos)                                                              |
| Kind mute sets        | 30007 | mute pubkeys by kinds<br>`"d"` tag MUST be the kind string                                   | `"p"` (pubkeys)                                                                     |
| Interest sets         | 30015 | interest topics represented by a bunch of "hashtags"                                         | `"t"` (hashtags)                                                                    |
| Emoji sets            | 30030 | categorized emoji groups                                                                     | `"emoji"` (see [NIP-30](30.md))                                                     |
| Release artifact sets | 30063 | group of artifacts of a software release                                                     | `"e"` (kind:1063 [file metadata](94.md) events), `"a"` (software application event) |
| App curation sets     | 30267 | references to multiple software applications                                                 | `"a"` (software application event)                                                  |
| Calendar              | 31924 | a set of events categorized in any way                                                       | `"a"` (calendar event event)                                                        |
| Starter packs         | 39089 | a named set of profiles to be shared around with the goal of being followed together         | `"p"` (pubkeys)                                                                     |
| Media starter packs   | 39092 | same as above, but specific to multimedia (photos, short video) clients                      | `"p"` (pubkeys)                                                                     |

### Deprecated standard lists

Some clients have used these lists in the past, but they should work on transitioning to the [standard formats](#standard-lists) above.

| kind  | "d" tag         | use instead                   |
| ---   | ---             | ---                           |
| 30000 | `"mute"`        | kind 10000 _mute list_        |
| 30001 | `"pin"`         | kind 10001 _pin list_         |
| 30001 | `"bookmark"`    | kind 10003 _bookmarks list_   |
| 30001 | `"communities"` | kind 10004 _communities list_ |

## Examples

### A _mute list_ with some public items and some encrypted items

```json
{
  "id": "a92a316b75e44cfdc19986c634049158d4206fcc0b7b9c7ccbcdabe28beebcd0",
  "pubkey": "854043ae8f1f97430ca8c1f1a090bdde6488bd5115c7a45307a2a212750ae4cb",
  "created_at": 1699597889,
  "kind": 10000,
  "tags": [
    ["p", "07caba282f76441955b695551c3c5c742e5b9202a3784780f8086fdcdc1da3a9"],
    ["p", "a55c15f5e41d5aebd236eca5e0142789c5385703f1a7485aa4b38d94fd18dcc4"]
  ],
  "content": "TJob1dQrf2ndsmdbeGU+05HT5GMnBSx3fx8QdDY/g3NvCa7klfzgaQCmRZuo1d3WQjHDOjzSY1+MgTK5WjewFFumCcOZniWtOMSga9tJk1ky00tLoUUzyLnb1v9x95h/iT/KpkICJyAwUZ+LoJBUzLrK52wNTMt8M5jSLvCkRx8C0BmEwA/00pjOp4eRndy19H4WUUehhjfV2/VV/k4hMAjJ7Bb5Hp9xdmzmCLX9+64+MyeIQQjQAHPj8dkSsRahP7KS3MgMpjaF8nL48Bg5suZMxJayXGVp3BLtgRZx5z5nOk9xyrYk+71e2tnP9IDvSMkiSe76BcMct+m7kGVrRcavDI4n62goNNh25IpghT+a1OjjkpXt9me5wmaL7fxffV1pchdm+A7KJKIUU3kLC7QbUifF22EucRA9xiEyxETusNludBXN24O3llTbOy4vYFsq35BeZl4v1Cse7n2htZicVkItMz3wjzj1q1I1VqbnorNXFgllkRZn4/YXfTG/RMnoK/bDogRapOV+XToZ+IvsN0BqwKSUDx+ydKpci6htDRF2WDRkU+VQMqwM0CoLzy2H6A2cqyMMMD9SLRRzBg==?iv=S3rFeFr1gsYqmQA7bNnNTQ==",
  "sig": "1173822c53261f8cffe7efbf43ba4a97a9198b3e402c2a1df130f42a8985a2d0d3430f4de350db184141e45ca844ab4e5364ea80f11d720e36357e1853dba6ca"
}
```

### A _curation set_ of articles and notes about yaks

```json
{
  "id": "567b41fc9060c758c4216fe5f8d3df7c57daad7ae757fa4606f0c39d4dd220ef",
  "pubkey": "d6dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c",
  "created_at": 1695327657,
  "kind": 30004,
  "tags": [
    ["d", "jvdy9i4"],
    ["title", "Yaks"],
    ["image", "https://cdn.britannica.com/40/188540-050-9AC748DE/Yak-Himalayas-Nepal.jpg"],
    ["description", "The domestic yak, also known as the Tartary ox, grunting ox, or hairy cattle, is a species of long-haired domesticated cattle found throughout the Himalayan region of the Indian subcontinent, the Tibetan Plateau, Gilgit-Baltistan, Tajikistan and as far north as Mongolia and Siberia."],
    ["a", "30023:26dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:95ODQzw3ajNoZ8SyMDOzQ"],
    ["a", "30023:54af95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:1-MYP8dAhramH9J5gJWKx"],
    ["a", "30023:f8fe95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:D2Tbd38bGrFvU0bIbvSMt"],
    ["e", "d78ba0d5dce22bfff9db0a9e996c9ef27e2c91051de0c4e1da340e0326b4941e"]
  ],
  "content": "",
  "sig": "a9a4e2192eede77e6c9d24ddfab95ba3ff7c03fbd07ad011fff245abea431fb4d3787c2d04aad001cb039cb8de91d83ce30e9a94f82ac3c5a2372aa1294a96bd"
}
```

### A _release artifact set_ of an Example App

```jsonc
{
  "id": "567b41fc9060c758c4216fe5f8d3df7c57daad7ae757fa4606f0c39d4dd220ef",
  "pubkey": "d6dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c",
  "created_at": 1695327657,
  "kind": 30063,
  "content": "Release notes in markdown",
  "tags": [
    ["d", "com.example.app@0.0.1"],
    ["e", "d78ba0d5dce22bfff9db0a9e996c9ef27e2c91051de0c4e1da340e0326b4941e"], // Windows exe
    ["e", "f27e2c91051de0c4e1da0d5dce22bfff9db0a9340e0326b4941ed78bae996c9e"], // MacOS dmg
    ["e", "9d24ddfab95ba3ff7c03fbd07ad011fff245abea431fb4d3787c2d04aad02332"], // Linux AppImage
    ["e", "340e0326b340e0326b4941ed78ba340e0326b4941ed78ba340e0326b49ed78ba"], // PWA
    ["a", "32267:d6dc95542e18b8b7aec2f14610f55c335abebec76f3db9e58c254661d0593a0c:com.example.app"] // Reference to parent software application
  ],
  "content": "Example App is a decentralized marketplace for apps",
  "sig": "a9a4e2192eede77e6c9d24ddfab95ba3ff7c03fbd07ad011fff245abea431fb4d3787c2d04aad001cb039cb8de91d83ce30e9a94f82ac3c5a2372aa1294a96bd"
}
```

### An _app curation set_

```jsonc
{
    "id": "d8037fa866eb5acd2159960b3ada7284172f7d687b5289cc72a96ca2b431b611",
    "pubkey": "78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d",
    "sig": "c1ce0a04521c020ae7485307cd86285530c1f778766a3fd594d662a73e7c28f307d7cd9a9ab642ae749fce62abbabb3a32facfe8d19a21fba551b60fae863d95",
    "kind": 30267,
    "created_at": 1729302793,
    "content": "My nostr app selection",
    "tags": [
        ["d", "nostr"],
        ["a", "32267:7579076d9aff0a4cfdefa7e2045f2486c7e5d8bc63bfc6b45397233e1bbfcb19:com.example.app1"],
        ["a", "32267:045f2486c7e5d8bc63bfc6b45397233e1bbfcb197579076d9aff0a4cfdefa7e2:net.example.app2"],
        ["a", "32267:264387284e647ba6938995735ec8c7d5c5a6f026307d78ce6faa725737e55130:pl.code.app3"]
    ]
}
```

## Encryption process pseudocode

```scala
val private_items = [
  ["p", "07caba282f76441955b695551c3c5c742e5b9202a3784780f8086fdcdc1da3a9"],
  ["a", "a55c15f5e41d5aebd236eca5e0142789c5385703f1a7485aa4b38d94fd18dcc4"],
]
val base64blob = nip04.encrypt(json.encode_to_string(private_items))
event.content = base64blob
```


NIP-23
======

Long-form Content
-----------------

`draft` `optional`

This NIP defines `kind:30023` (an _addressable event_) for long-form text content, generally referred to as "articles" or "blog posts". `kind:30024` has the same structure as `kind:30023` and is used to save long form drafts.

"Social" clients that deal primarily with `kind:1` notes should not be expected to implement this NIP.

### Format

The `.content` of these events should be a string text in Markdown syntax. To maximize compatibility and readability between different clients and devices, any client that is creating long form notes:

- MUST NOT hard line-break paragraphs of text, such as arbitrary line breaks at 80 column boundaries.

- MUST NOT support adding HTML to Markdown.

### Metadata

For the date of the last update the `.created_at` field should be used, for "tags"/"hashtags" (i.e. topics about which the event might be of relevance) the `t` tag should be used.

Other metadata fields can be added as tags to the event as necessary. Here we standardize 4 that may be useful, although they remain strictly optional:

- `"title"`, for the article title
- `"image"`, for a URL pointing to an image to be shown along with the title
- `"summary"`, for the article summary
- `"published_at"`, for the timestamp in unix seconds (stringified) of the first time the article was published

### Editability

These articles are meant to be editable, so they should include a `d` tag with an identifier for the article. Clients should take care to only publish and read these events from relays that implement that. If they don't do that they should also take care to hide old versions of the same article they may receive.

### Linking

The article may be linked to using the [NIP-19](19.md) `naddr` code along with the `a` tag.

### References

References to other Nostr notes, articles or profiles must be made according to [NIP-27](27.md), i.e. by using [NIP-21](21.md) `nostr:...` links and optionally adding tags for these (see example below).

## Example Event

```json
{
  "kind": 30023,
  "created_at": 1675642635,
  "content": "Lorem [ipsum][nostr:nevent1qqst8cujky046negxgwwm5ynqwn53t8aqjr6afd8g59nfqwxpdhylpcpzamhxue69uhhyetvv9ujuetcv9khqmr99e3k7mg8arnc9] dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\nRead more at nostr:naddr1qqzkjurnw4ksz9thwden5te0wfjkccte9ehx7um5wghx7un8qgs2d90kkcq3nk2jry62dyf50k0h36rhpdtd594my40w9pkal876jxgrqsqqqa28pccpzu.",
  "tags": [
    ["d", "lorem-ipsum"],
    ["title", "Lorem Ipsum"],
    ["published_at", "1296962229"],
    ["t", "placeholder"],
    ["e", "b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87", "wss://relay.example.com"],
    ["a", "30023:a695f6b60119d9521934a691347d9f78e8770b56da16bb255ee286ddf9fda919:ipsum", "wss://relay.nostr.org"]
  ],
  "pubkey": "...",
  "id": "..."
}
```

### Replies & Comments

Replies to `kind 30023` MUST use [NIP-22](./22.md) `kind 1111` comments. 


NIP-99
======

Classified Listings
-------------------

`draft` `optional`

This NIP defines `kind:30402`: an addressable event to describe classified listings that list any arbitrary product, service, or other thing for sale or offer and includes enough structured metadata to make them useful.

The specification supports a broad range of use cases physical goods, services, work opportunities, rentals, free giveaways, personals, etc. To promote interoperability between clients implementing NIP-99 for e-commerce, you can find the extension proposal [here](https://github.com/GammaMarkets/market-spec/blob/main/spec.md) which standardizes the e-commerce use case while maintaining the specification's lightweight and flexible nature. While [NIP-15](15.md) provides a strictly structured marketplace specification, NIP-99 has emerged as a simpler and more flexible alternative.

The structure of these events is very similar to [NIP-23](23.md) long-form content events.

### Draft / Inactive Listings

`kind:30403` has the same structure as `kind:30402` and is used to save draft or inactive classified listings.

### Content

The `.content` field should be a description of what is being offered and by whom. These events should be a string in Markdown syntax.

### Author

The `.pubkey` field of these events are treated as the party creating the listing.

### Metadata

- For "tags"/"hashtags" (i.e. categories or keywords of relevance for the listing) the `"t"` event tag should be used.
- For images, whether included in the markdown content or not, clients SHOULD use `image` tags as described in [NIP-58](58.md). This allows clients to display images in carousel format more easily.

The following tags, used for structured metadata, are standardized and SHOULD be included. Other tags may be added as necessary.

- `"title"`, a title for the listing
- `"summary"`, for short tagline or summary for the listing
- `"published_at"`, for the timestamp (in unix seconds – converted to string) of the first time the listing was published.
- `"location"`, for the location.
- `"price"`, for the price of the thing being listed. This is an array in the format `[ "price", "<number>", "<currency>", "<frequency>" ]`.
  - `"price"` is the name of the tag
  - `"<number>"` is the amount in numeric format (but included in the tag as a string)
  - `"<currency>"` is the currency unit in 3-character ISO 4217 format or ISO 4217-like currency code (e.g. `"btc"`, `"eth"`).
  - `"<frequency>"` is optional and can be used to describe recurring payments. SHOULD be in noun format (hour, day, week, month, year, etc.)
- - `"status"` (optional), the status of the listing. SHOULD be either "active" or "sold".

#### `price` examples

- $50 one-time payment `["price", "50", "USD"]`
- €15 per month `["price", "15", "EUR", "month"]`
- £50,000 per year `["price", "50000", "GBP", "year"]`

Other standard tags that might be useful.

- `"g"`, a geohash for more precise location

## Example Event

```jsonc
{
  "kind": 30402,
  "created_at": 1675642635,
  // Markdown content
  "content": "Lorem [ipsum][nostr:nevent1qqst8cujky046negxgwwm5ynqwn53t8aqjr6afd8g59nfqwxpdhylpcpzamhxue69uhhyetvv9ujuetcv9khqmr99e3k7mg8arnc9] dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n\nRead more at nostr:naddr1qqzkjurnw4ksz9thwden5te0wfjkccte9ehx7um5wghx7un8qgs2d90kkcq3nk2jry62dyf50k0h36rhpdtd594my40w9pkal876jxgrqsqqqa28pccpzu.",
  "tags": [
    ["d", "lorem-ipsum"],
    ["title", "Lorem Ipsum"],
    ["published_at", "1296962229"],
    ["t", "electronics"],
    ["image", "https://url.to.img", "256x256"],
    ["summary", "More lorem ipsum that is a little more than the title"],
    ["location", "NYC"],
    ["price", "100", "USD"],
    [
      "e",
      "b3e392b11f5d4f28321cedd09303a748acfd0487aea5a7450b3481c60b6e4f87",
      "wss://relay.example.com"
    ],
    [
      "a",
      "30023:a695f6b60119d9521934a691347d9f78e8770b56da16bb255ee286ddf9fda919:ipsum",
      "wss://relay.nostr.org"
    ]
  ],
  "pubkey": "...",
  "id": "..."
}
```


REAL EXAMPLE COURSE NOSTR:

{
  "pubkey": "f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741",
  "content": "",
  "id": "d2797459e3f15491b39225a68146d3ec375f71d01b57cfe3a559179777e20912",
  "created_at": 1740860353,
  "kind": 30004,
  "tags": [
    [
      "d",
      "f538f5c5-1a72-4804-8eb1-3f05cea64874"
    ],
    [
      "name",
      "pleb.school Starter Course"
    ],
    [
      "about",
      "Welcome to the pleb.school starter course! This demo track walks you from complete beginner to capable builder while showcasing how the configurable, Nostr-native platform delivers lessons across the web and relays. \n\nIn this starter course we cover: \n1. Setting up your Code Editor, \n2. Git / GitHub \n3. HTML \n4. CSS \n5. JavaScript. \n\nStarter Course Objectives:\n1. Provide an easy-to-follow overview of the developer journey\n2. Get you comfortable in a development environment\n3. Give you hands-on experience with core programming languages\n4. Get you ready to publish your own courses on the pleb.school stack and explore the rest of the content on the platform."
    ],
    [
      "image",
      "https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/plebdevs-starter.png"
    ],
    [
      "t",
      "beginner"
    ],
    [
      "t",
      "frontend"
    ],
    [
      "t",
      "course"
    ],
    [
      "published_at",
      "1740860353"
    ],
    [
      "a",
      "30023:f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741:6d8260b3-c902-46ec-8aed-f3b8c8f1229b"
    ],
    [
      "a",
      "30023:f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741:f93827ed-68ad-4b5e-af33-f7424b37f0d6"
    ],
    [
      "a",
      "30023:f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741:80aac9d4-8bef-4a92-9ee9-dea1c2d66c3a"
    ],
    [
      "a",
      "30023:f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741:6fe3cb4b-2571-4e3b-9159-db78325ee5cc"
    ],
    [
      "a",
      "30023:f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741:e5399c72-9b95-46d6-a594-498e673b6c58"
    ],
    [
      "a",
      "30023:f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741:a3083ab5-0187-4b77-83d1-29ae1f644559"
    ]
  ]
}

REAL EXAMPLE VIDEO LESSON NOSTR:

{"content":"<div style=\"position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;\"><video style=\"position:absolute;top:0;left:0;width:100%;height:100%;border:0;\" controls>\n<source src=\"https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/starter-lesson-1.mp4\" type=\"video/mp4\"/>\n<source src=\"https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/starter-lesson-1.webm\" type=\"video/mp4\"/>\n</video></div>\n\n# Setting Up Your Code Editor\n\n## Introduction\nIn this lesson, we'll set up the most fundamental tool in your development journey: your code editor. This is where you'll spend most of your time writing, testing, and debugging code, so it's crucial to get comfortable with it from the start.\n\n## What is an IDE?\n\n### Definition\nAn IDE (Integrated Development Environment) is a software application that provides comprehensive facilities for software development. Think of it as your complete workshop for writing code.\n\n### Key Components\n1. **Code Editor**\n   - Where you write and edit code\n   - Provides syntax highlighting\n   - Helps with code formatting\n   - Makes code easier to read and write\n\n2. **Compiler/Interpreter**\n   - Runs your code\n   - Translates your code into executable instructions\n   - Helps test your applications\n\n3. **Debugging Tools**\n   - Help find and fix errors\n   - Provide error messages and suggestions\n   - Make problem-solving easier\n\n## Setting Up Visual Studio Code\n\n### Why VS Code?\n- Free and open-source\n- Lightweight yet powerful\n- Excellent community support\n- Popular among developers\n- Great for beginners and experts alike\n\n### Installation Steps\n1. Visit [code.visualstudio.com](https://code.visualstudio.com)\n2. Download the version for your operating system\n3. Run the installer\n4. Follow the installation prompts\n\n### Essential VS Code Features\n\n#### 1. Interface Navigation\n- **File Explorer** (Ctrl/Cmd + Shift + E)\n  - Browse and manage your files\n  - Create new files and folders\n  - Navigate your project structure\n\n- **Search** (Ctrl/Cmd + Shift + F)\n  - Find text across all files\n  - Replace text globally\n  - Search with regular expressions\n\n- **Source Control** (Ctrl/Cmd + Shift + G)\n  - Track changes in your code\n  - Commit and manage versions\n  - Integrate with Git\n\n#### 2. Terminal Integration\nTo open the integrated terminal:\n- Use ``` Ctrl + ` ``` (backtick)\n- Or View → Terminal from the menu\n- Basic terminal commands:\n  ```bash\n  ls      # List files (dir on Windows)\n  cd      # Change directory\n  clear   # Clear terminal\n  code .  # Open VS Code in current directory\n  ```\n\n#### 3. Essential Extensions\nInstall these extensions to enhance your development experience:\n1. **ESLint**\n   - Helps find and fix code problems\n   - Enforces coding standards\n   - Improves code quality\n\n2. **Prettier**\n   - Automatically formats your code\n   - Maintains consistent style\n   - Saves time on formatting\n\n3. **Live Server**\n   - Runs your web pages locally\n   - Auto-refreshes on save\n   - Great for web development\n\n### Important Keyboard Shortcuts\n```\nCtrl/Cmd + S          # Save file\nCtrl/Cmd + C          # Copy\nCtrl/Cmd + V          # Paste\nCtrl/Cmd + Z          # Undo\nCtrl/Cmd + Shift + P  # Command palette\nCtrl/Cmd + P          # Quick file open\n```\n\n## Writing Your First Code\nLet's create and run a simple HTML file:\n\n1. Create a new file (`index.html`)\n2. Add basic HTML content:\n   ```html\n   <h1>Hello World!</h1>\n   ```\n3. Save the file (Ctrl/Cmd + S)\n4. Open in browser or use Live Server\n\n## Best Practices\n\n### 1. File Organization\n- Keep related files together\n- Use clear, descriptive names\n- Create separate folders for different projects\n\n### 2. Regular Saving\n- Save frequently (Ctrl/Cmd + S)\n- Watch for the unsaved dot indicator\n- Enable auto-save if preferred\n\n### 3. Terminal Usage\n- Get comfortable with basic commands\n- Use the integrated terminal\n- Practice navigation and file operations\n\n## Troubleshooting Common Issues\n\n### 1. Installation Problems\n- Ensure you have admin rights\n- Check system requirements\n- Use official download sources\n\n### 2. Extension Issues\n- Keep extensions updated\n- Disable conflicting extensions\n- Restart VS Code after installation\n\n### 3. Performance\n- Don't install too many extensions\n- Regular restart of VS Code\n- Keep your system updated\n\n## Next Steps\n\n1. **Practice Navigation**\n   - Create and manage files\n   - Use the integrated terminal\n   - Try keyboard shortcuts\n\n2. **Customize Your Editor**\n   - Explore themes\n   - Adjust font size\n   - Configure auto-save\n\n3. **Prepare for Next Lesson**\n   - Keep VS Code open\n   - Get comfortable with the interface\n   - Practice basic operations\n\n## Additional Resources\n- [VS Code Documentation](https://code.visualstudio.com/docs)\n- [Keyboard Shortcuts Reference](https://code.visualstudio.com/shortcuts/keyboard-shortcuts-windows.pdf)\n- [VS Code Tips and Tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)\n\nRemember: Your code editor is your primary tool as a developer. Take time to get comfortable with it, and don't worry about mastering everything at once. Focus on the basics we covered in the video, and you'll naturally learn more features as you need them.\n\nHappy coding! 🚀","created_at":1740871522,"id":"d3ac1f40bf07c045e97c43b6cbdf6f274de464d1c9d5a5c04d04d50fc12156c0","kind":30023,"pubkey":"f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741","sig":"380c060f8536549749f5d81bb052f218491b76f10544eaf3c255be3a21fad5bdeb65d89e9d28290b16d48134fc898008b14f6dc390a92cb23933ccdfb30dcc86","tags":[["title","Setting up your Code Editor"],["summary","In this lesson, we'll set up the most fundamental tool in your development journey: your code editor. This is where you'll spend most of your time writing, testing, and debugging code, so it's crucial to get comfortable with it from the start."],["image","https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/starter-thumbnail-1.png"],["d","f93827ed-68ad-4b5e-af33-f7424b37f0d6"],["t","video"],["t","document"],["t","beginner"],["r","https://docs.google.com/presentation/d/1TC2BcHMa8zHVfAafwgXGEhUS5beTHUp5UsaPwWYty2w/edit?usp=sharing"]]}

REAL EXAMPLE VIDEO RESOURCE FREE NOSTR:

{"content":"<div style=\"position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;\"><iframe src=\"https://www.youtube.com/embed/M_tVo_9OUIs?enablejsapi=1\" style=\"position:absolute;top:0;left:0;width:100%;height:100%;border:0;\" allowfullscreen></iframe></div>","created_at":1751292222,"id":"abd1b6682aaccbaf4260b0da05db07caa30977f663e33eb36eacc56d85e62fa7","kind":30023,"pubkey":"f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741","sig":"6057c73905eb00f8560926367db3126d73ad72efb2439ee5ddb34ae294f64881787194a23bcf2c9a7b8e837f7d1e207138928fd2895315f47c6338ee460a79c9","tags":[["d","6e138ca7-fa4f-470c-9146-fec270a9688e"],["title","Build a Lightning Wallet in 20 Minutes"],["summary","Build a Lightning Wallet in just about 20 mins leveraging the FREE Voltage MutinyNet Lightning Node's to make it easier than ever to build on Bitcoin & Lightning and make REAL payments on a REAL network."],["image","https://plebdevs-bucket.nyc3.cdn.digitaloceanspaces.com/images/build-lightning-wallet-20-mins.png"],["i","youtube:plebdevs","V_fvmyJ91m0"],["t","lightning"],["t","workshop"],["t","video"],["published_at","1751292222"],["r","https://tinyurl.com/20-min-lightning"],["r","https://github.com/AustinKelsay/20-min-lightning-workshop"]]}

REAL EXAMPLE DOCUMENT RESOURCE FREE NOSTR:

{"content":"# Setting Up a React App from Scratch: A Minimal Guide\n\n## Prerequisites\n\n- Node.js and npm installed on your machine\n- A text editor of your choice\n\n## Step 1: Create a New Project Directory\n\n```bash\nmkdir my-react-app\ncd my-react-app\n```\n\n## Step 2: Initialize the Project\n\n```bash\nnpm init -y\n```\n\nThis creates a package.json file with default values.\n\n## Step 3: Install Dependencies\n\n```bash\nnpm install react react-dom\nnpm install --save-dev parcel @babel/preset-react\n```\n\n## Step 4: Create Project Structure\n\nCreate the following files and directories:\n\n```\nmy-react-app/\n├── src/\n│   ├── index.html\n│   └── index.js\n└── package.json\n```\n\n## Step 5: Set Up HTML\n\nIn src/index.html, add the following content:\n\n```html\n<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>My React App</title>\n</head>\n<body>\n    <div id=\"root\"></div>\n    <script src=\"./index.js\"></script>\n</body>\n</html>\n```\n\n## Step 6: Create React Entry Point\n\nIn src/index.js, add the following content:\n\n```javascript\nimport React from 'react';\nimport ReactDOM from 'react-dom/client';\n\nconst App = () => {\n    return <h1>Hello, React!</h1>;\n};\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<App />);\n```\n\n## Step 7: Configure Babel\n\nCreate a .babelrc file in the project root:\n\n```json\n{\n    \"presets\": [\"@babel/preset-react\"]\n}\n```\n\n## Step 8: Update package.json Scripts\n\nAdd the following scripts to your package.json:\n\n```json\n\"scripts\": {\n    \"start\": \"parcel src/index.html\",\n    \"build\": \"parcel build src/index.html\"\n}\n```\n\n## Step 9: Run the Development Server\n\n```bash\nnpm start\n```\n\nYour app should now be running at http://localhost:1234.\n\n## Step 10: Build for Production\n\nWhen you're ready to deploy:\n\n```bash\nnpm run build\n```\n\nThis will create a dist folder with your optimized production build.\n\n---\n\nCongratulations! You've set up a React app from scratch using Parcel. This setup provides a lightweight and modern development environment with minimal overhead.","created_at":1731696272,"id":"758149694299ce464c299f9b97a2c6a3e94536eeeeb939fa981d3b09dbf1cf11","kind":30023,"pubkey":"f33c8a9617cb15f705fc70cd461cfd6eaf22f9e24c33eabad981648e5ec6f741","sig":"4389b364746a27a0c650adb14ab043475eb66cfde20ccaa00d029d91c06a9863469e7e1db0627ece0f205122cad5d34efd77bf668fef77e34404b9cb925a8220","tags":[["d","e25f3d3b-f28b-4edd-a325-380564e6db7d"],["title","Setting Up a React App from Scratch: A Minimal Guide"],["summary","This guide will walk you through setting up a React app manually, using Parcel as a bundler for its simplicity and efficiency."],["image","https://miro.medium.com/v2/resize:fit:1200/1*jfpk9Pld9ZGh9f68NMb-Cg.jpeg"],["t","guide"],["t","document"],["published_at","1731696272"],["r","https://parceljs.org/recipes/react/"]]}
