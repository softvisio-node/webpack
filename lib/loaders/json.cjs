module.exports = async function ( buffer, map, meta ) {
    const callback = this.async(),
        options = this.getOptions();

    if ( this.cacheable ) this.cacheable();

    const config = options.parseJsonConfig( buffer, { "json5": true } );

    callback( null, `export default ${JSON.stringify( config )}`, map, meta );
};
