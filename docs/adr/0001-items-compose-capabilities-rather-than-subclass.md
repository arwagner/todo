# Items compose Capabilities rather than subclass

The system must track work that varies along four independent axes: labels, shape (due dates, recurrence, streaks, quantity targets), lifecycle, and behavior. Modeling those variations as a closed set of Item types would grow as the product of the axes, because every new combination such as "a recurring item that also blocks something" would need its own type. Instead there is one Item, Capabilities attach to it independently, and a Preset is only a named bundle applied at creation that nothing branches on afterward.

## Consequences

No Capability is guaranteed present, so every read path must handle absence. The compiler cannot express "a habit always has a streak", and Presets validate that at creation time as a runtime check instead. In exchange, each Capability ships independently and nothing already built changes when a new one arrives.
