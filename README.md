# Partialtongue

This module is a utility for inserting files or parts of files into other files. It doesn't care about the file formats, and allows you to specify both arbitrary delimiters and an arbitrary prefix for which items in those delimiters are to be processed. It can be used programmatically and as a command line tool, globally or locally installed. Partials can be referenced relative to the current file, or relative to a node dependency (via the module resolution process).

# Why?

I have a series of modules that depend on each other for functionality, where some of the options are passed up the chain. The documentation for the "user-facing" API got out of sync with one of its dependents, where the options were actually defined and the behavior implemented. I looked for something that would let me essentially include parts of the documentation from parent modules into the current module's readme, but didn't find anything I liked. So I wrote this.

# How?

Probably the simplest usage is like this:

    [me@box project]$ npm install -g partialtongue
    [me@box project]$ partialtongue src/README.pt>README.md

If we imagine that `src/README.pt` contains markdown like so:

    # Tongue twisters
    
    The sixth sick sheik's sixth sheep's sick
    <!--pt:import upstream:src/README.pt section-->

And we have a module `upstream` such that `project/node_modules/upstream/src/README.pt` exists and contains something like this:

    # Riddles
    
    Some text here
    
    <!--pt:export section-->
    ### Lewis Carroll
    
    Why is a raven like a writing desk?
    <!--pt:end-->

Then the output (`README.md`) will look like this:

    # Tongue twisters
    
    The sixth sick sheik's sixth sheep's sick!

    ### Lewis Carroll
    
    Why is a raven like a writing desk?
    
# Delimiters

Partialtongue only replaces data within specified delimiters. By default, these are the HTML comment delimiters `<!--` and `-->`. Note: this is a pure string replacement, not actual HTML parsing and processing. The delimiters are set with the `options` argument programmatically, or with the `--start` and `--end` command line switches.

# Prefix

When partialtongue encounters some data between the given delimiters, it performs one further check to see if the data is intended for its consumption or not. If this check fails, the data is not modified. If it succeeds, the data is consumed entirely (including the delimiters) and replaced with the appropriate data, if any. The default prefix is `pt:`.

# Directives

### import [source] [reference]
This directive can take a number of forms:

- `import <ref>`
- `import <file.ext>`
- `import <file.ext> <ref>`
- `import <module>:<file.ext>`
- `import <module>:<file.ext> <ref>`

A ref is simply a named reference as specified by the `export` directive. If no path is specified, the reference is looked for within the current file. If a path is specified, that file is processed by partialtongue and the result inserted. If a path *and* a reference are specified, the file is processed and then the reference looked up in that file; the result of the reference is inserted. If you prefix a path with `<module>:`, the file path will be taken relative to the root directory of the given module. If no module is supplied, paths are taken relative to the directory of the file they appeared in.

### export [reference]
This directive has two forms: one for embedded data and one for delimited data. An example helps:

Delimited data:

    <!--pt:export foo-->
    This is delimited data. It ends when the 'end' directive is encountered.
    <!--pt:end-->  

Embedded data:

    <!--pt:export foo
    This is embedded data. It begins with a newline after the reference name
    and ends when the closing delimiter is encountered.-->

### end
This directive serves only to terminate a delimited reference.

# API

Programmatic usage is as follows:

    var partialtongue = require('partialtongue')({
        start: <start delim>,
        end: <end delim>,
        prefix: <prefix>
    });

    var outStream = partialtongue(inStream, sourceDir);

`inStream` should be a readable stream, and `sourceDir` is the root directory for relative paths to be based on. It's currently a required parameter, though the command line interface sets it to `process.cwd()` when using pipes.

# CLI

Command line usage is as follows:

    partialtongue -i <source file> -o <destination file> --start <start delim> --end <end delim> --prefix <prefix>

All switches are optional; if you leave off `-i`, the first non-switch argument is taken (`partialtongue <source file>`). If there is no source file, `stdin` is used. If there is no output file, `stdout` is used.
